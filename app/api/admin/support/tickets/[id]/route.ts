import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { setTicketStatus } from '@/lib/support-tickets'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED']),
})

/** PATCH /api/admin/support/tickets/[id] — resolve / reopen a ticket. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid status', 400, 'VALIDATION_ERROR')

    const existing = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!existing) return errorResponse('Ticket not found', 404, 'NOT_FOUND')

    const ticket = await setTicketStatus(id, parsed.data.status, userId)
    void writeAudit({
      clerkUserId: userId,
      entity: 'SupportTicket',
      entityId: id,
      action: 'ticket_status_changed',
      metadata: { from: existing.status, to: parsed.data.status },
    })
    return successResponse({ ticket: { id: ticket.id, status: ticket.status } })
  } catch (error) {
    logger.error('[SUPPORT] admin status error', {}, error as Error)
    return errorResponse('Failed to update ticket')
  }
}
