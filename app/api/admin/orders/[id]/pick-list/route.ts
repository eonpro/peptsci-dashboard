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
import { buildOrderPickList } from '@/lib/fulfillment/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/orders/[id]/pick-list — FIFO pick plan as JSON. Admin only. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const pickList = await buildOrderPickList(id)
    return successResponse({ pickList })
  } catch (error) {
    if (error instanceof Error && error.message === 'Order not found') {
      return errorResponse('Order not found', 404, 'NOT_FOUND')
    }
    logger.error(
      '[admin/orders/pick-list] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to build pick list')
  }
}
