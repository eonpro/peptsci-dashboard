/**
 * Support tickets — threaded clinic ↔ PeptSci conversations, modeled on the
 * patient-message chat (dual read flags, frozen senderName) but scoped to a
 * ticket with a status workflow:
 *
 *   OPEN      needs PeptSci attention (new ticket, or clinic replied)
 *   PENDING   PeptSci replied; waiting on the clinic
 *   RESOLVED  closed by an admin; a clinic reply reopens it
 *
 * Read tracking mirrors lib/patient-messages.ts: the sender's own side is
 * stamped read at creation; the opposite side flips in bulk when that side
 * fetches the thread.
 */
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { SupportMessageSenderRole, SupportTicketStatus } from '@prisma/client'

export const ticketCreateSchema = z.object({
  subject: z.string().trim().min(3, 'Subject is required').max(200),
  message: z.string().trim().min(1, 'Message cannot be empty').max(4000),
})

export const ticketMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(4000),
})

export interface SerializedTicketMessage {
  id: string
  senderName: string
  senderRole: SupportMessageSenderRole
  body: string
  createdAt: string
}

const messageSelect = {
  id: true,
  senderName: true,
  senderRole: true,
  body: true,
  createdAt: true,
} as const

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

function serialize(m: {
  id: string
  senderName: string
  senderRole: SupportMessageSenderRole
  body: string
  createdAt: Date
}): SerializedTicketMessage {
  return { ...m, createdAt: m.createdAt.toISOString() }
}

export interface CreateTicketInput {
  clientId: string
  subject: string
  body: string
  senderId: string | null
  senderName: string
  createdBy?: string | null
}

/** Open a ticket with its first clinic message. */
export async function createTicket(input: CreateTicketInput) {
  return db().supportTicket.create({
    data: {
      clientId: input.clientId,
      subject: input.subject,
      status: 'OPEN',
      createdBy: input.createdBy ?? null,
      messages: {
        create: {
          senderId: input.senderId,
          senderName: input.senderName,
          senderRole: 'CLINIC',
          body: input.body,
          readByClinic: true,
          readByAdmin: false,
        },
      },
    },
    include: { messages: { select: messageSelect } },
  })
}

/**
 * Fetch a ticket's thread (oldest first) and mark the other side's messages
 * read by the viewer.
 */
export async function getTicketThreadAndMarkRead(
  ticketId: string,
  viewer: SupportMessageSenderRole,
  limit = 200
): Promise<SerializedTicketMessage[]> {
  const client = db()
  const readFlag = viewer === 'CLINIC' ? 'readByClinic' : 'readByAdmin'
  const otherRole: SupportMessageSenderRole = viewer === 'CLINIC' ? 'PEPTSCI' : 'CLINIC'

  const [, messages] = await client.$transaction([
    client.supportTicketMessage.updateMany({
      where: { ticketId, senderRole: otherRole, [readFlag]: false },
      data: { [readFlag]: true },
    }),
    client.supportTicketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: messageSelect,
    }),
  ])
  return messages.reverse().map(serialize)
}

export interface SendTicketMessageInput {
  ticketId: string
  senderId: string | null
  senderName: string
  senderRole: SupportMessageSenderRole
  body: string
}

/**
 * Append a message and advance the status machine: a clinic message (re)opens
 * the ticket; a PeptSci reply parks it PENDING on the clinic.
 */
export async function sendTicketMessage(
  input: SendTicketMessageInput
): Promise<SerializedTicketMessage> {
  const client = db()
  const [message] = await client.$transaction([
    client.supportTicketMessage.create({
      data: {
        ticketId: input.ticketId,
        senderId: input.senderId,
        senderName: input.senderName,
        senderRole: input.senderRole,
        body: input.body,
        readByClinic: input.senderRole === 'CLINIC',
        readByAdmin: input.senderRole === 'PEPTSCI',
      },
      select: messageSelect,
    }),
    client.supportTicket.update({
      where: { id: input.ticketId },
      data:
        input.senderRole === 'CLINIC'
          ? { status: 'OPEN', resolvedAt: null, resolvedBy: null }
          : { status: 'PENDING' },
    }),
  ])
  return serialize(message)
}

/** Resolve (or reopen) a ticket. */
export async function setTicketStatus(
  ticketId: string,
  status: SupportTicketStatus,
  actorClerkId?: string | null
) {
  return db().supportTicket.update({
    where: { id: ticketId },
    data:
      status === 'RESOLVED'
        ? { status, resolvedAt: new Date(), resolvedBy: actorClerkId ?? null }
        : { status, resolvedAt: null, resolvedBy: null },
  })
}

/** A clinic's tickets, newest activity first, with the viewer's unread count. */
export async function listTicketsForClient(clientId: string) {
  const tickets = await db().supportTicket.findMany({
    where: { clientId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: messageSelect },
      _count: {
        select: {
          messages: { where: { senderRole: 'PEPTSCI', readByClinic: false } },
        },
      },
    },
  })
  return tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    lastMessage: t.messages[0] ? serialize(t.messages[0]) : null,
    unread: t._count.messages,
  }))
}

/** Admin queue: tickets across all clinics, filterable by status. */
export async function listTicketsForAdmin(status?: SupportTicketStatus) {
  const tickets = await db().supportTicket.findMany({
    where: status ? { status } : {},
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: {
      client: { select: { id: true, organizationName: true, contactEmail: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: messageSelect },
      _count: {
        select: {
          messages: { where: { senderRole: 'CLINIC', readByAdmin: false } },
        },
      },
    },
  })
  return tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    client: t.client,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    lastMessage: t.messages[0] ? serialize(t.messages[0]) : null,
    unread: t._count.messages,
  }))
}
