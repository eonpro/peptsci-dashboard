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
import { syncSalesRecordFromOrder } from '@/lib/sales'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Row-by-row idempotent upserts (no giant transaction); allow up to 5 minutes.
// A re-run after a timeout safely resumes since each order syncs by orderId.
export const maxDuration = 300

/**
 * POST /api/admin/sales/backfill-orders
 *
 * One-time (re-runnable) backfill: mirror every already-captured platform Order
 * into the SalesRecord analytics table. Idempotent — syncSalesRecordFromOrder
 * upserts by orderId, so re-running is safe. Going forward new captures are
 * synced automatically in reconcileOrderFromPaymentIntent.
 *
 * Body: { confirm: true }. Admin only. Runs server-side so it works against the
 * prod (IAM-auth) database that the CLI script can't reach.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const body = (await request.json().catch(() => ({}))) as { confirm?: boolean }
    if (body?.confirm !== true) {
      return errorResponse('Confirmation required: POST { "confirm": true }', 400, 'CONFIRM_REQUIRED')
    }

    const orders = await prisma.order.findMany({
      where: { paymentStatus: 'CAPTURED' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })

    const summary = { total: orders.length, processed: 0, synced: 0, failed: 0 }

    for (const o of orders) {
      summary.processed++
      try {
        await syncSalesRecordFromOrder(o.id)
        summary.synced++
      } catch (rowErr) {
        summary.failed++
        logger.warn('Order->SalesRecord backfill row failed', {
          orderId: o.id,
          error: rowErr instanceof Error ? rowErr.message : String(rowErr),
        })
      }
    }

    logger.info('Orders sales backfill completed', { by: userId, ...summary })
    return successResponse(summary)
  } catch (error) {
    logger.error(
      'Error backfilling sales from orders',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to backfill from orders')
  }
}
