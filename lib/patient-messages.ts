/**
 * Patient message thread — two-way chat between a clinic (CLIENT users) and
 * PeptSci staff (admins), scoped to one saved patient.
 *
 * Read tracking: each message carries readByClinic / readByAdmin flags. The
 * sender's own side is stamped read at creation; the opposite side is flipped
 * in bulk whenever that side fetches the thread, so "unread" badges reflect
 * messages the viewer has never had on screen.
 */
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { PatientMessageSenderRole } from '@prisma/client'

export const messageCreateSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(4000),
})

export interface SerializedPatientMessage {
  id: string
  senderName: string
  senderRole: PatientMessageSenderRole
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
  senderRole: PatientMessageSenderRole
  body: string
  createdAt: Date
}): SerializedPatientMessage {
  return { ...m, createdAt: m.createdAt.toISOString() }
}

/**
 * Fetch a patient's thread (oldest first) and mark the other side's messages
 * as read by the viewer. Returns up to the latest `limit` messages.
 */
export async function getThreadAndMarkRead(
  patientId: string,
  viewer: PatientMessageSenderRole,
  limit = 200
): Promise<SerializedPatientMessage[]> {
  const client = db()
  const readFlag = viewer === 'CLINIC' ? 'readByClinic' : 'readByAdmin'
  const otherRole: PatientMessageSenderRole = viewer === 'CLINIC' ? 'PEPTSCI' : 'CLINIC'

  const [, messages] = await client.$transaction([
    client.patientMessage.updateMany({
      where: { patientId, senderRole: otherRole, [readFlag]: false },
      data: { [readFlag]: true },
    }),
    client.patientMessage.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: messageSelect,
    }),
  ])
  return messages.reverse().map(serialize)
}

export interface SendMessageInput {
  patientId: string
  clientId: string
  senderId: string | null
  senderName: string
  senderRole: PatientMessageSenderRole
  body: string
}

/** Persist a new message; the sender's own read flag is stamped true. */
export async function sendMessage(input: SendMessageInput): Promise<SerializedPatientMessage> {
  const message = await db().patientMessage.create({
    data: {
      patientId: input.patientId,
      clientId: input.clientId,
      senderId: input.senderId,
      senderName: input.senderName,
      senderRole: input.senderRole,
      body: input.body,
      readByClinic: input.senderRole === 'CLINIC',
      readByAdmin: input.senderRole === 'PEPTSCI',
    },
    select: messageSelect,
  })
  return serialize(message)
}

/**
 * Per-patient unread counts for one side of the conversation.
 * CLINIC viewers count unread PEPTSCI messages and vice versa.
 */
export async function unreadCountsByPatient(
  clientId: string,
  viewer: PatientMessageSenderRole
): Promise<Record<string, number>> {
  const readFlag = viewer === 'CLINIC' ? 'readByClinic' : 'readByAdmin'
  const otherRole: PatientMessageSenderRole = viewer === 'CLINIC' ? 'PEPTSCI' : 'CLINIC'

  const groups = await db().patientMessage.groupBy({
    by: ['patientId'],
    where: { clientId, senderRole: otherRole, [readFlag]: false },
    _count: { _all: true },
  })
  return Object.fromEntries(groups.map((g) => [g.patientId, g._count._all]))
}
