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
import { listTicketsForAdmin } from '@/lib/support-tickets'
import type { SupportTicketStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const STATUSES: SupportTicketStatus[] = ['OPEN', 'PENDING', 'RESOLVED']

/** GET /api/admin/support/tickets?status=OPEN — the support queue. */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const raw = new URL(request.url).searchParams.get('status')
    const status = STATUSES.includes(raw as SupportTicketStatus)
      ? (raw as SupportTicketStatus)
      : undefined

    const tickets = await listTicketsForAdmin(status)
    return successResponse({ tickets })
  } catch (error) {
    logger.error('[SUPPORT] admin list error', {}, error as Error)
    return errorResponse('Failed to load tickets')
  }
}
