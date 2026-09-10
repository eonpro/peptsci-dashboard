/**
 * SMS inbox core — the write path shared by the Twilio driver (outbound) and
 * the inbound webhook. Keeps `SmsConversation` (one CRM thread per phone) in
 * step with `SmsMessage` rows. Deliberately does NOT import the driver so the
 * driver can import this without a cycle; staff replies live in ./inbox.
 *
 * @module lib/sms/inbox-core
 */

import { prisma } from '../prisma'
import { logger } from '../logger'
import { toE164US } from './phone'
import { messagePreview, nextConversationStatusAfterInbound } from './inbox-utils'

/**
 * Practices whose contactPhone normalizes to `phoneE164`. contactPhone is
 * free-form ("(555) 123-4567"), so pre-filter by the last 4 digits in SQL and
 * finish the comparison in JS.
 */
export async function findClientIdsByPhone(phoneE164: string): Promise<string[]> {
  if (!prisma) return []
  const last4 = phoneE164.slice(-4)
  const candidates = await prisma.client.findMany({
    where: { contactPhone: { contains: last4 } },
    select: { id: true, contactPhone: true },
    take: 200,
  })
  return candidates.filter((c) => toE164US(c.contactPhone) === phoneE164).map((c) => c.id)
}

/**
 * Best guess at which practice a number belongs to: an explicit subscriber
 * link wins, then a contactPhone match (only when unambiguous).
 */
export async function resolveClientIdForPhone(phoneE164: string): Promise<string | null> {
  if (!prisma) return null
  const sub = await prisma.smsSubscriber.findUnique({
    where: { phone: phoneE164 },
    select: { clientId: true },
  })
  if (sub?.clientId) return sub.clientId
  const ids = await findClientIdsByPhone(phoneE164)
  return ids.length === 1 ? ids[0] : null
}

/**
 * Find-or-create the thread for a number. Fills in `clientId` when the thread
 * has none and a link is known; never overwrites a staff-set link.
 */
export async function ensureConversation(
  phoneE164: string,
  opts: { clientId?: string | null } = {}
): Promise<{ id: string; clientId: string | null; status: string; isNew: boolean }> {
  if (!prisma) throw new Error('Database is not configured')
  const existing = await prisma.smsConversation.findUnique({
    where: { phone: phoneE164 },
    select: { id: true, clientId: true, status: true },
  })
  if (existing) {
    if (!existing.clientId && opts.clientId) {
      await prisma.smsConversation.update({
        where: { id: existing.id },
        data: { clientId: opts.clientId },
      })
      return { ...existing, clientId: opts.clientId, isNew: false }
    }
    return { ...existing, isNew: false }
  }
  const clientId = opts.clientId ?? (await resolveClientIdForPhone(phoneE164))
  const created = await prisma.smsConversation.create({
    data: { phone: phoneE164, clientId, status: 'OPEN' },
    select: { id: true, clientId: true, status: true },
  })
  return { ...created, isNew: true }
}

export interface RecordInboundInput {
  from: string
  body: string
  twilioSid: string | null
  /** Campaign keyword detected by the webhook (STOP/START/HELP) or null. */
  keyword: string | null
}

export interface RecordInboundResult {
  conversationId: string
  messageId: string
  clientId: string | null
  isNewConversation: boolean
  /** True when this Twilio SID had already been stored (webhook retry). */
  duplicate: boolean
}

/**
 * Store an inbound text and bump its thread: unread +1, last-message denorms,
 * and reopen if CLOSED. Idempotent on Twilio's MessageSid so webhook retries
 * don't double-count.
 */
export async function recordInboundMessage(input: RecordInboundInput): Promise<RecordInboundResult | null> {
  if (!prisma) throw new Error('Database is not configured')
  const phone = toE164US(input.from)
  if (!phone) return null

  if (input.twilioSid) {
    const dup = await prisma.smsMessage.findUnique({
      where: { twilioSid: input.twilioSid },
      select: { id: true, conversationId: true, clientId: true },
    })
    if (dup?.conversationId) {
      return {
        conversationId: dup.conversationId,
        messageId: dup.id,
        clientId: dup.clientId,
        isNewConversation: false,
        duplicate: true,
      }
    }
  }

  const convo = await ensureConversation(phone)
  const body = input.body.trim() || '(empty message)'
  const now = new Date()

  const [message] = await prisma.$transaction([
    prisma.smsMessage.create({
      data: {
        phone,
        direction: 'INBOUND',
        body,
        kind: input.keyword ? `KEYWORD_${input.keyword}` : 'INBOUND',
        status: 'RECEIVED',
        twilioSid: input.twilioSid,
        clientId: convo.clientId,
        conversationId: convo.id,
        sentAt: now,
      },
      select: { id: true },
    }),
    prisma.smsConversation.update({
      where: { id: convo.id },
      data: {
        status: nextConversationStatusAfterInbound(convo.status),
        closedAt: null,
        closedById: null,
        unreadCount: { increment: 1 },
        lastMessageAt: now,
        lastMessagePreview: messagePreview(body),
        lastDirection: 'INBOUND',
      },
    }),
  ])

  return {
    conversationId: convo.id,
    messageId: message.id,
    clientId: convo.clientId,
    isNewConversation: convo.isNew,
    duplicate: false,
  }
}

export interface LinkOutboundInput {
  messageId: string
  phone: string
  body: string
  clientId?: string | null
  /** Pre-resolved thread (staff replies); otherwise found/created by phone. */
  conversationId?: string | null
  /** Skip the last-message bump (e.g. SKIPPED rows that never left the app). */
  touch?: boolean
}

/**
 * Attach an outbound delivery-log row to its thread and refresh the thread's
 * last-message denorms. Best-effort: never throws (the send already happened).
 */
export async function linkOutboundMessage(input: LinkOutboundInput): Promise<string | null> {
  if (!prisma) return null
  try {
    const convo = input.conversationId
      ? { id: input.conversationId }
      : await ensureConversation(input.phone, { clientId: input.clientId ?? null })
    const now = new Date()
    await prisma.$transaction([
      prisma.smsMessage.update({
        where: { id: input.messageId },
        data: { conversationId: convo.id },
      }),
      ...(input.touch === false
        ? []
        : [
            prisma.smsConversation.update({
              where: { id: convo.id },
              data: {
                lastMessageAt: now,
                lastMessagePreview: messagePreview(input.body),
                lastDirection: 'OUTBOUND',
              },
            }),
          ]),
    ])
    return convo.id
  } catch (error) {
    logger.warn('SMS conversation link failed (non-blocking)', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
