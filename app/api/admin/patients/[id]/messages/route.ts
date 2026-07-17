import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveAdminUserId } from '@/lib/notifications/current-user'
import { getThreadAndMarkRead, sendMessage, messageCreateSchema } from '@/lib/patient-messages'
import { notifyUser } from '@/lib/notifications/service'

export const dynamic = 'force-dynamic'

async function loadPatient(patientId: string) {
  return prisma!.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      clientId: true,
      client: { select: { organizationName: true } },
    },
  })
}

/** GET — a patient's message thread; marks clinic messages read by staff. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const patient = await loadPatient(id)
    if (!patient) return errorResponse('Patient not found', 404, 'NOT_FOUND')

    const messages = await getThreadAndMarkRead(id, 'PEPTSCI')
    return successResponse({ messages })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load messages'
    logger.error('[PATIENT MESSAGES] admin list error', { message }, error as Error)
    return errorResponse(message)
  }
}

/** POST — send a message from PeptSci staff to the clinic. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const patient = await loadPatient(id)
    if (!patient) return errorResponse('Patient not found', 404, 'NOT_FOUND')

    const parsed = messageCreateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const adminUserId = await resolveAdminUserId(userId)
    const admin = adminUserId
      ? await prisma.user.findUnique({
          where: { id: adminUserId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null
    const senderName =
      [admin?.firstName, admin?.lastName].filter(Boolean).join(' ') || admin?.email || 'PeptSci Team'

    const message = await sendMessage({
      patientId: patient.id,
      clientId: patient.clientId,
      senderId: adminUserId,
      senderName,
      senderRole: 'PEPTSCI',
      body: parsed.data.body,
    })

    // Notify the clinic's active users. Best-effort: the message is already
    // persisted, so notification failures are logged and swallowed.
    try {
      const clinicUsers = await prisma.user.findMany({
        where: { clientId: patient.clientId, status: 'ACTIVE' },
        select: { id: true },
      })
      for (const u of clinicUsers) {
        await notifyUser(u.id, {
          clientId: patient.clientId,
          category: 'CLIENT',
          priority: 'NORMAL',
          title: `New message from PeptSci about ${patient.firstName} ${patient.lastName}`,
          message: `${senderName}: ${parsed.data.body.slice(0, 140)}`,
          actionUrl: '/shop/account#patients',
          metadata: { patientId: patient.id, messageId: message.id },
          sourceType: 'patient-message',
          sourceId: message.id,
        })
      }
    } catch (notifyError) {
      logger.error(
        '[PATIENT MESSAGES] clinic notify failed',
        { patientId: patient.id },
        notifyError as Error
      )
    }

    return successResponse({ message }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send message'
    logger.error('[PATIENT MESSAGES] admin send error', { message }, error as Error)
    return errorResponse(message)
  }
}
