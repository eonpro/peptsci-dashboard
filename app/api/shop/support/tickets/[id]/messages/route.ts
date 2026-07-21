import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import {
  getTicketThreadAndMarkRead,
  sendTicketMessage,
  ticketMessageSchema,
} from '@/lib/support-tickets'
import { notifyAdmins } from '@/lib/notifications/service'

export const dynamic = 'force-dynamic'

/** Auth + clinic ownership of the ticket. */
async function authOwnedTicket(request: NextRequest, ticketId: string) {
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

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, clientId: actor.clientId },
    select: { id: true, subject: true, status: true, clientId: true },
  })
  if (!ticket) return { error: errorResponse('Ticket not found', 404, 'NOT_FOUND') }
  return { actor, ticket }
}

/** GET — the ticket thread; marks PeptSci messages read by the clinic. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authOwnedTicket(request, id)
    if ('error' in auth) return auth.error

    const messages = await getTicketThreadAndMarkRead(id, 'CLINIC')
    return successResponse({ messages, ticket: auth.ticket })
  } catch (error) {
    logger.error('[SUPPORT] shop thread error', {}, error as Error)
    return errorResponse('Failed to load ticket')
  }
}

/** POST — clinic reply; reopens a RESOLVED ticket. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authOwnedTicket(request, id)
    if ('error' in auth) return auth.error
    const { actor, ticket } = auth

    const parsed = ticketMessageSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Message cannot be empty', 400, 'VALIDATION_ERROR')

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

    const message = await sendTicketMessage({
      ticketId: ticket.id,
      senderId: actor.userId,
      senderName,
      senderRole: 'CLINIC',
      body: parsed.data.body,
    })

    await notifyAdmins({
      clientId: actor.clientId,
      category: 'CLIENT',
      priority: 'HIGH',
      title: `Reply on ticket: ${ticket.subject}`,
      message: `${senderName}: ${parsed.data.body.slice(0, 140)}`,
      actionUrl: `/support?ticket=${ticket.id}`,
      sourceType: 'support-ticket-message',
      sourceId: message.id,
    }).catch((err) => logger.warn('[SUPPORT] admin notify failed', { err: String(err) }))

    return successResponse({ message }, 201)
  } catch (error) {
    logger.error('[SUPPORT] shop reply error', {}, error as Error)
    return errorResponse('Failed to send message')
  }
}
