import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import { createTicket, listTicketsForClient, ticketCreateSchema } from '@/lib/support-tickets'
import { notifyAdmins } from '@/lib/notifications/service'

export const dynamic = 'force-dynamic'

async function authActor(request: NextRequest) {
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
  return { actor, clerkUserId: userId }
}

/** GET /api/shop/support/tickets — the practice's tickets, newest first. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authActor(request)
    if ('error' in auth) return auth.error

    const tickets = await listTicketsForClient(auth.actor.clientId)
    return successResponse({ tickets })
  } catch (error) {
    logger.error('[SUPPORT] shop list error', {}, error as Error)
    return errorResponse('Failed to load tickets')
  }
}

/** POST /api/shop/support/tickets — open a new ticket. */
export async function POST(request: NextRequest) {
  try {
    const auth = await authActor(request)
    if ('error' in auth) return auth.error
    const { actor, clerkUserId } = auth

    const parsed = ticketCreateSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const sender = await prisma!.user.findUnique({
      where: { id: actor.userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        client: { select: { organizationName: true } },
      },
    })
    const senderName =
      [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') ||
      sender?.email ||
      sender?.client?.organizationName ||
      'Clinic'

    const ticket = await createTicket({
      clientId: actor.clientId,
      subject: parsed.data.subject,
      body: parsed.data.message,
      senderId: actor.userId,
      senderName,
      createdBy: clerkUserId,
    })

    // Ring the admin bell — best-effort, the ticket is already persisted.
    await notifyAdmins({
      clientId: actor.clientId,
      category: 'CLIENT',
      priority: 'HIGH',
      title: `New support ticket: ${ticket.subject}`,
      message: `${sender?.client?.organizationName ?? senderName}: ${parsed.data.message.slice(0, 140)}`,
      actionUrl: `/support?ticket=${ticket.id}`,
      sourceType: 'support-ticket',
      sourceId: ticket.id,
    }).catch((err) => logger.warn('[SUPPORT] admin notify failed', { err: String(err) }))

    return successResponse({ ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status } }, 201)
  } catch (error) {
    logger.error('[SUPPORT] shop create error', {}, error as Error)
    return errorResponse('Failed to open ticket')
  }
}
