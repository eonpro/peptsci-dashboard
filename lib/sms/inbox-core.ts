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
import { pickClientFromCandidates, rankCandidates, type ClientCandidate } from './phone-match'

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

function phoneFromAddress(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null
  const p = (address as Record<string, unknown>).phone
  return typeof p === 'string' ? toE164US(p) : null
}

/**
 * Every clinic that has this number anywhere in the system, tagged with where
 * it was found (see ./phone-match for the ranking). Each source is best-effort
 * so one failing lookup never hides the others.
 */
export async function findClientCandidatesByPhone(phoneE164: string): Promise<ClientCandidate[]> {
  if (!prisma) return []
  const db = prisma
  const last4 = phoneE164.slice(-4)
  const out: ClientCandidate[] = []

  const lookups: Array<Promise<void>> = [
    db.smsSubscriber
      .findUnique({ where: { phone: phoneE164 }, select: { clientId: true } })
      .then((sub) => {
        if (sub?.clientId) out.push({ clientId: sub.clientId, source: 'SUBSCRIBER' })
      }),
    db.smsMessage
      .findMany({
        where: { phone: phoneE164, direction: 'OUTBOUND', clientId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { clientId: true },
        take: 10,
      })
      .then((rows) => {
        for (const r of rows) if (r.clientId) out.push({ clientId: r.clientId, source: 'PRIOR_TEXT' })
      }),
    findClientIdsByPhone(phoneE164).then((ids) => {
      for (const id of ids) out.push({ clientId: id, source: 'CONTACT_PHONE' })
    }),
    db.client
      .findMany({
        where: { shippingAddress: { path: ['phone'], string_contains: last4 } },
        select: { id: true, shippingAddress: true },
        take: 100,
      })
      .then((rows) => {
        for (const r of rows) {
          if (phoneFromAddress(r.shippingAddress) === phoneE164) out.push({ clientId: r.id, source: 'SHIPPING_PHONE' })
        }
      }),
    db.order
      .findMany({
        where: { shippingAddress: { path: ['phone'], string_contains: last4 } },
        orderBy: { createdAt: 'desc' },
        select: { clientId: true, shippingAddress: true },
        take: 100,
      })
      .then((rows) => {
        for (const r of rows) {
          if (phoneFromAddress(r.shippingAddress) === phoneE164) out.push({ clientId: r.clientId, source: 'SHIPPING_PHONE' })
        }
      }),
  ]

  const results = await Promise.allSettled(lookups)
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.warn('[SMS INBOX] client candidate lookup failed', {
        phone: phoneE164,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      })
    }
  }
  return rankCandidates(out)
}

/**
 * Best guess at which practice a number belongs to. Auto-links only when the
 * strongest evidence tier names exactly one clinic; otherwise null so staff
 * see "possible matches" instead of a wrong link.
 */
export async function resolveClientIdForPhone(phoneE164: string): Promise<string | null> {
  if (!prisma) return null
  return pickClientFromCandidates(await findClientCandidatesByPhone(phoneE164))
}

/**
 * Find-or-create the thread for a number. Fills in `clientId` when the thread
 * has none and a link is known (explicit or freshly resolved — a clinic added
 * after the first text still gets linked on the next one); never overwrites a
 * staff-set link.
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
    if (!existing.clientId) {
      const clientId = opts.clientId ?? (await resolveClientIdForPhone(phoneE164))
      if (clientId) {
        await prisma.smsConversation.update({
          where: { id: existing.id },
          data: { clientId },
        })
        // Earlier inbound texts on this thread were stored untagged; retag them.
        await prisma.smsMessage.updateMany({
          where: { conversationId: existing.id, clientId: null },
          data: { clientId },
        })
        return { ...existing, clientId, isNew: false }
      }
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
