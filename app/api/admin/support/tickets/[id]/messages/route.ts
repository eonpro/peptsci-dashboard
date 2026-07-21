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
import {
  getTicketThreadAndMarkRead,
  sendTicketMessage,
  ticketMessageSchema,
} from '@/lib/support-tickets'
import { notifyUser } from '@/lib/notifications/service'

export const dynamic = 'force-dynamic'

async function loadTicket(id: string) {
  return prisma!.supportTicket.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      status: true,
      clientId: true,
      client: { select: { organizationName: true } },
    },
  })
}

/** GET — a ticket's thread; marks clinic messages read by staff. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const ticket = await loadTicket(id)
    if (!ticket) return errorResponse('Ticket not found', 404, 'NOT_FOUND')

    const messages = await getTicketThreadAndMarkRead(id, 'PEPTSCI')
    return successResponse({ messages, ticket })
  } catch (error) {
    logger.error('[SUPPORT] admin thread error', {}, error as Error)
    return errorResponse('Failed to load ticket')
  }
}

/** POST — staff reply; parks the ticket PENDING on the clinic. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const ticket = await loadTicket(id)
    if (!ticket) return errorResponse('Ticket not found', 404, 'NOT_FOUND')

    const parsed = ticketMessageSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Message cannot be empty', 400, 'VALIDATION_ERROR')

    const adminUserId = await resolveAdminUserId(userId)
    const admin = adminUserId
      ? await prisma.user.findUnique({
          where: { id: adminUserId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null
    const senderName =
      [admin?.firstName, admin?.lastName].filter(Boolean).join(' ') || admin?.email || 'PeptSci Support'

    const message = await sendTicketMessage({
      ticketId: ticket.id,
      senderId: adminUserId,
      senderName,
      senderRole: 'PEPTSCI',
      body: parsed.data.body,
    })

    // Bell for the clinic's active users — best-effort.
    try {
      const clinicUsers = await prisma.user.findMany({
        where: { clientId: ticket.clientId, status: 'ACTIVE' },
        select: { id: true },
      })
      for (const u of clinicUsers) {
        await notifyUser(u.id, {
          clientId: ticket.clientId,
          category: 'CLIENT',
          priority: 'NORMAL',
          title: `Support replied: ${ticket.subject}`,
          message: `${senderName}: ${parsed.data.body.slice(0, 140)}`,
          actionUrl: '/shop/support',
          sourceType: 'support-ticket-message',
          sourceId: message.id,
        })
      }
    } catch (notifyError) {
      logger.error('[SUPPORT] clinic notify failed', { ticketId: ticket.id }, notifyError as Error)
    }

    return successResponse({ message }, 201)
  } catch (error) {
    logger.error('[SUPPORT] admin reply error', {}, error as Error)
    return errorResponse('Failed to send message')
  }
}
