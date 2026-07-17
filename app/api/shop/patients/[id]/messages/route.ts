import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import { getThreadAndMarkRead, sendMessage, messageCreateSchema } from '@/lib/patient-messages'
import { notifyAdmins } from '@/lib/notifications/service'

export const dynamic = 'force-dynamic'

/** Auth + clinic ownership of the patient the thread hangs off. */
async function authOwnedPatient(request: NextRequest, patientId: string) {
  const { userId, isAuthenticated } = await requireAuth()
  if (!isAuthenticated || !userId) return { error: unauthorizedResponse() }

  const rl = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
  if (rl.limited) {
    return {
      error: NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.standard, rl.retryAfter) }
      ),
    }
  }
  if (!prisma) return { error: errorResponse('Database not connected', 503, 'DB_UNAVAILABLE') }

  const actor = await resolveShopActor(userId)
  if (!actor) return { error: errorResponse('No client account linked', 403, 'NO_CLIENT') }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clientId: actor.clientId },
    select: { id: true, firstName: true, lastName: true, clientId: true },
  })
  if (!patient) return { error: errorResponse('Patient not found', 404, 'NOT_FOUND') }
  return { actor, patient }
}

/** GET — the patient's message thread; marks PeptSci messages read by clinic. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authOwnedPatient(request, id)
    if ('error' in auth) return auth.error

    const messages = await getThreadAndMarkRead(id, 'CLINIC')
    return successResponse({ messages })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load messages'
    logger.error('[PATIENT MESSAGES] shop list error', { message }, error as Error)
    return errorResponse(message)
  }
}

/** POST — send a message from the clinic to PeptSci staff. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authOwnedPatient(request, id)
    if ('error' in auth) return auth.error
    const { actor, patient } = auth

    const parsed = messageCreateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const sender = await prisma!.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true, email: true, client: { select: { organizationName: true } } },
    })
    const senderName =
      [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') ||
      sender?.email ||
      sender?.client?.organizationName ||
      'Clinic'

    const message = await sendMessage({
      patientId: patient.id,
      clientId: actor.clientId,
      senderId: actor.userId,
      senderName,
      senderRole: 'CLINIC',
      body: parsed.data.body,
    })

    // Alert PeptSci staff via the admin notification bell. Failure to notify
    // must not fail the send — the message is already persisted.
    try {
      await notifyAdmins({
        clientId: actor.clientId,
        category: 'CLIENT',
        priority: 'NORMAL',
        title: `New message about ${patient.firstName} ${patient.lastName}`,
        message: `${senderName} (${sender?.client?.organizationName ?? 'clinic'}): ${parsed.data.body.slice(0, 140)}`,
        actionUrl: `/clients/${actor.clientId}#patients`,
        metadata: { patientId: patient.id, messageId: message.id },
        sourceType: 'patient-message',
        sourceId: message.id,
      })
    } catch (notifyError) {
      logger.error(
        '[PATIENT MESSAGES] admin notify failed',
        { patientId: patient.id },
        notifyError as Error
      )
    }

    return successResponse({ message }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send message'
    logger.error('[PATIENT MESSAGES] shop send error', { message }, error as Error)
    return errorResponse(message)
  }
}
