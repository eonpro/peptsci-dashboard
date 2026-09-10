/**
 * SMS inbox service — what the admin Messages UI talks to. Read models for the
 * conversation list / thread, staff actions (reply, assign, close, link to a
 * practice, mark read), and the pieces the client-detail "Texts" tab needs.
 *
 * Replies go through `sendSms` (same Messaging Service as tracking texts) so
 * STOP suppression, the delivery log and status callbacks all apply.
 *
 * @module lib/sms/inbox
 */

import { prisma } from '../prisma'
import { logger } from '../logger'
import { STAFF_ROLES } from '../access'
import { sendSms } from './client'
import { findClientCandidatesByPhone, linkOutboundMessage } from './inbox-core'
import { MATCH_SOURCE_LABEL, type MatchSource } from './phone-match'
import {
  consentStateFor,
  displayNameForStaff,
  formatPhoneDisplay,
  messagePreview,
  type ConsentState,
  type ConversationListQuery,
  type ConversationPatch,
} from './inbox-utils'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

const staffSelect = { id: true, firstName: true, lastName: true, email: true } as const
const clientSelect = {
  id: true,
  organizationName: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  smsOptIn: true,
} as const

export interface StaffRef {
  id: string
  name: string
}

export interface ConversationRow {
  id: string
  phone: string
  phoneDisplay: string
  contactName: string | null
  /** Best label for the list: practice name → contact name → formatted phone. */
  title: string
  client: { id: string; organizationName: string; contactName: string | null } | null
  status: string
  assignedTo: StaffRef | null
  unreadCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastDirection: string | null
  consent: ConsentState
  createdAt: string
}

export interface ConversationListSummary {
  open: number
  unreadThreads: number
  mine: number
}

export interface ThreadMessage {
  id: string
  direction: string
  kind: string
  body: string
  status: string
  errorCode: string | null
  errorMessage: string | null
  sentBy: StaffRef | null
  orderId: string | null
  orderNumber: number | null
  readAt: string | null
  sentAt: string | null
  deliveredAt: string | null
  createdAt: string
}

export interface ConversationDetail extends ConversationRow {
  client:
    | {
        id: string
        organizationName: string
        contactName: string | null
        contactEmail: string | null
        contactPhone: string | null
        smsOptIn: boolean
      }
    | null
  subscriber: {
    consentedAt: string | null
    optedOutAt: string | null
    source: string
  } | null
  closedAt: string | null
  closedBy: StaffRef | null
  messages: ThreadMessage[]
  /**
   * Clinics this number appears under when the thread is not linked — either
   * ambiguous (two clinics share the number) or newly discoverable. Empty when
   * linked or nothing matches.
   */
  suggestedClients: SuggestedClient[]
}

export interface SuggestedClient {
  id: string
  organizationName: string
  contactName: string | null
  source: MatchSource
  sourceLabel: string
}

type ConvoRecord = {
  id: string
  phone: string
  contactName: string | null
  status: string
  unreadCount: number
  lastMessageAt: Date | null
  lastMessagePreview: string | null
  lastDirection: string | null
  createdAt: Date
  client: { id: string; organizationName: string; contactName: string | null; smsOptIn: boolean } | null
  assignedTo: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null
}

function staffRef(
  u: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null
): StaffRef | null {
  return u ? { id: u.id, name: displayNameForStaff(u) } : null
}

function titleFor(c: { client: { organizationName: string } | null; contactName: string | null; phone: string }) {
  return c.client?.organizationName || c.contactName || formatPhoneDisplay(c.phone)
}

function toRow(
  c: ConvoRecord,
  sub: { consentedAt: Date | null; optedOutAt: Date | null } | null | undefined
): ConversationRow {
  return {
    id: c.id,
    phone: c.phone,
    phoneDisplay: formatPhoneDisplay(c.phone),
    contactName: c.contactName,
    title: titleFor(c),
    client: c.client
      ? { id: c.client.id, organizationName: c.client.organizationName, contactName: c.client.contactName }
      : null,
    status: c.status,
    assignedTo: staffRef(c.assignedTo),
    unreadCount: c.unreadCount,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: c.lastMessagePreview,
    lastDirection: c.lastDirection,
    consent: consentStateFor(sub ?? null, Boolean(c.client?.smsOptIn)),
    createdAt: c.createdAt.toISOString(),
  }
}

async function subscribersByPhone(phones: string[]) {
  if (phones.length === 0) return new Map<string, { consentedAt: Date | null; optedOutAt: Date | null }>()
  const subs = await db().smsSubscriber.findMany({
    where: { phone: { in: phones } },
    select: { phone: true, consentedAt: true, optedOutAt: true },
  })
  return new Map(subs.map((s) => [s.phone, { consentedAt: s.consentedAt, optedOutAt: s.optedOutAt }]))
}

/** Inbox list: newest activity first, with queue counters for the filter bar. */
export async function listConversations(
  query: ConversationListQuery,
  viewerUserId: string | null
): Promise<{ conversations: ConversationRow[]; summary: ConversationListSummary }> {
  const client = db()
  const where: NonNullable<Parameters<typeof client.smsConversation.findMany>[0]>['where'] = {}
  if (query.status !== 'ALL') where.status = query.status
  if (query.unread) where.unreadCount = { gt: 0 }
  if (query.mine && viewerUserId) where.assignedToId = viewerUserId
  if (query.clientId) where.clientId = query.clientId
  if (query.q) {
    const digits = query.q.replace(/\D/g, '')
    where.OR = [
      { contactName: { contains: query.q, mode: 'insensitive' } },
      { client: { organizationName: { contains: query.q, mode: 'insensitive' } } },
      { client: { contactName: { contains: query.q, mode: 'insensitive' } } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ]
  }

  const [rows, open, unreadThreads, mine] = await Promise.all([
    client.smsConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: query.limit,
      include: {
        client: { select: { id: true, organizationName: true, contactName: true, smsOptIn: true } },
        assignedTo: { select: staffSelect },
      },
    }),
    client.smsConversation.count({ where: { status: 'OPEN' } }),
    client.smsConversation.count({ where: { unreadCount: { gt: 0 } } }),
    viewerUserId
      ? client.smsConversation.count({ where: { assignedToId: viewerUserId, status: 'OPEN' } })
      : Promise.resolve(0),
  ])
  const subs = await subscribersByPhone(rows.map((r) => r.phone))
  return {
    conversations: rows.map((r) => toRow(r, subs.get(r.phone))),
    summary: { open, unreadThreads, mine },
  }
}

/** Number of threads with unread inbound texts (nav badge). */
export async function unreadConversationCount(): Promise<number> {
  return db().smsConversation.count({ where: { unreadCount: { gt: 0 } } })
}

/** Clinics an unlinked number appears under, with names, for one-click linking. */
async function suggestClientsForPhone(phone: string): Promise<SuggestedClient[]> {
  try {
    const cands = await findClientCandidatesByPhone(phone)
    if (cands.length === 0) return []
    const clients = await db().client.findMany({
      where: { id: { in: cands.map((c) => c.clientId) } },
      select: { id: true, organizationName: true, contactName: true },
    })
    const byId = new Map(clients.map((c) => [c.id, c]))
    return cands.flatMap((c) => {
      const cl = byId.get(c.clientId)
      return cl
        ? [{ id: cl.id, organizationName: cl.organizationName, contactName: cl.contactName, source: c.source, sourceLabel: MATCH_SOURCE_LABEL[c.source] }]
        : []
    })
  } catch (e) {
    logger.warn('[SMS INBOX] suggestClientsForPhone failed', { error: e instanceof Error ? e.message : String(e) })
    return []
  }
}

/** Full thread for the detail pane. Does not mark read — see markConversationRead. */
export async function getConversation(id: string, messageLimit = 300): Promise<ConversationDetail | null> {
  const client = db()
  const c = await client.smsConversation.findUnique({
    where: { id },
    include: {
      client: { select: clientSelect },
      assignedTo: { select: staffSelect },
      closedBy: { select: staffSelect },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: messageLimit,
        include: {
          sentBy: { select: staffSelect },
          order: { select: { id: true, orderNumber: true } },
        },
      },
    },
  })
  if (!c) return null
  const [sub, suggestedClients] = await Promise.all([
    client.smsSubscriber.findUnique({
      where: { phone: c.phone },
      select: { consentedAt: true, optedOutAt: true, source: true },
    }),
    c.client ? Promise.resolve([]) : suggestClientsForPhone(c.phone),
  ])
  const row = toRow(c, sub)
  return {
    ...row,
    client: c.client,
    suggestedClients,
    subscriber: sub
      ? {
          consentedAt: sub.consentedAt?.toISOString() ?? null,
          optedOutAt: sub.optedOutAt?.toISOString() ?? null,
          source: sub.source,
        }
      : null,
    closedAt: c.closedAt?.toISOString() ?? null,
    closedBy: staffRef(c.closedBy),
    messages: c.messages.reverse().map((m) => ({
      id: m.id,
      direction: m.direction,
      kind: m.kind,
      body: m.body,
      status: m.status,
      errorCode: m.errorCode,
      errorMessage: m.errorMessage,
      sentBy: staffRef(m.sentBy),
      orderId: m.orderId,
      orderNumber: m.order?.orderNumber ?? null,
      readAt: m.readAt?.toISOString() ?? null,
      sentAt: m.sentAt?.toISOString() ?? null,
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

/** Staff opened the thread: stamp inbound rows read and clear the counter. */
export async function markConversationRead(id: string): Promise<void> {
  const client = db()
  await client.$transaction([
    client.smsMessage.updateMany({
      where: { conversationId: id, direction: 'INBOUND', readAt: null },
      data: { readAt: new Date() },
    }),
    client.smsConversation.update({ where: { id }, data: { unreadCount: 0 } }),
  ])
}

/**
 * Assign / close / reopen / link to a practice / label the contact. Closing
 * stamps who and when; reopening clears both. Linking to a practice also
 * re-tags the thread's messages so the client's history is complete.
 */
export async function updateConversation(
  id: string,
  patch: ConversationPatch,
  actorUserId: string | null
): Promise<ConversationDetail | null> {
  const client = db()
  const data: Parameters<typeof client.smsConversation.update>[0]['data'] = {}
  if (patch.status === 'CLOSED') {
    data.status = 'CLOSED'
    data.closedAt = new Date()
    data.closedById = actorUserId
  } else if (patch.status === 'OPEN') {
    data.status = 'OPEN'
    data.closedAt = null
    data.closedById = null
  }
  if (patch.assignedToId !== undefined) data.assignedToId = patch.assignedToId
  if (patch.contactName !== undefined) data.contactName = patch.contactName || null
  if (patch.clientId !== undefined) data.clientId = patch.clientId

  const ops = [client.smsConversation.update({ where: { id }, data })]
  if (patch.clientId) {
    ops.push(
      client.smsMessage.updateMany({
        where: { conversationId: id, clientId: null },
        data: { clientId: patch.clientId },
      }) as never
    )
  }
  await client.$transaction(ops)
  return getConversation(id)
}

export type StaffReplyResult =
  | { ok: true; message: ThreadMessage; conversation: ConversationDetail }
  | { ok: false; code: 'NOT_FOUND' | 'OPTED_OUT' | 'SMS_DISABLED' | 'SEND_FAILED'; error: string }

/**
 * Send a staff reply on a thread. Refuses when STOP is on file (the driver
 * would suppress it anyway — this gives the UI a clear reason instead of a
 * silently SKIPPED row).
 */
export async function sendStaffReply(input: {
  conversationId: string
  body: string
  senderUserId: string | null
}): Promise<StaffReplyResult> {
  const client = db()
  const convo = await client.smsConversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, phone: true, clientId: true },
  })
  if (!convo) return { ok: false, code: 'NOT_FOUND', error: 'Conversation not found' }

  const sub = await client.smsSubscriber.findUnique({
    where: { phone: convo.phone },
    select: { optedOutAt: true },
  })
  if (sub?.optedOutAt) {
    return {
      ok: false,
      code: 'OPTED_OUT',
      error: 'This number replied STOP. They must text START before we can message them again.',
    }
  }

  const result = await sendSms({
    to: convo.phone,
    body: input.body,
    kind: 'STAFF_REPLY',
    clientId: convo.clientId,
    sentById: input.senderUserId,
    conversationId: convo.id,
  })

  if (result.skipped && result.reason === 'disabled') {
    return {
      ok: false,
      code: 'SMS_DISABLED',
      error: 'SMS sending is not enabled on this environment (SMS_ENABLED / Twilio credentials).',
    }
  }
  if (result.skipped && result.reason === 'opted_out') {
    return { ok: false, code: 'OPTED_OUT', error: 'This number has opted out of texts.' }
  }
  if (!result.ok) {
    logger.warn('[SMS INBOX] staff reply failed', { conversationId: convo.id, error: result.error })
    return { ok: false, code: 'SEND_FAILED', error: result.error || 'Twilio rejected the message.' }
  }

  // The driver already threaded the row; make sure the denorms reflect it even
  // if the best-effort link inside the driver lost a race.
  if (result.messageId) {
    await linkOutboundMessage({
      messageId: result.messageId,
      phone: convo.phone,
      body: input.body,
      clientId: convo.clientId,
      conversationId: convo.id,
    })
  }
  await markConversationRead(convo.id)

  const conversation = await getConversation(convo.id)
  if (!conversation) return { ok: false, code: 'NOT_FOUND', error: 'Conversation not found' }
  const message =
    conversation.messages.find((m) => m.id === result.messageId) ??
    conversation.messages[conversation.messages.length - 1]
  return { ok: true, message, conversation }
}

/** Active staff who can be assigned a thread. */
export async function listAssignableStaff(): Promise<StaffRef[]> {
  const users = await db().user.findMany({
    where: { role: { in: [...STAFF_ROLES] }, status: 'ACTIVE' },
    select: staffSelect,
    orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
    take: 100,
  })
  return users.map((u) => ({ id: u.id, name: displayNameForStaff(u) }))
}

/** Practice picker for "link this number to a clinic". */
export async function searchClientsForLink(q: string) {
  const term = q.trim()
  if (!term) return []
  const digits = term.replace(/\D/g, '')
  return db().client.findMany({
    where: {
      OR: [
        { organizationName: { contains: term, mode: 'insensitive' } },
        { contactName: { contains: term, mode: 'insensitive' } },
        { contactEmail: { contains: term, mode: 'insensitive' } },
        ...(digits.length >= 4 ? [{ contactPhone: { contains: digits.slice(-4) } }] : []),
      ],
    },
    select: { id: true, organizationName: true, contactName: true, contactPhone: true },
    orderBy: { organizationName: 'asc' },
    take: 10,
  })
}

/** Threads for one practice (client detail → Texts tab). */
export async function listConversationsForClient(clientId: string): Promise<ConversationRow[]> {
  const rows = await db().smsConversation.findMany({
    where: { clientId },
    orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 50,
    include: {
      client: { select: { id: true, organizationName: true, contactName: true, smsOptIn: true } },
      assignedTo: { select: staffSelect },
    },
  })
  const subs = await subscribersByPhone(rows.map((r) => r.phone))
  return rows.map((r) => toRow(r, subs.get(r.phone)))
}

export { messagePreview }
