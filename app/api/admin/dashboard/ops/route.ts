import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const WINDOW_DAYS = 30

/**
 * GET /api/admin/dashboard/ops — live counts for the dashboard action queues:
 * everything that needs an operator's attention right now. One cheap round
 * trip (all counts run in parallel).
 */
export async function GET() {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const now = new Date()

    const [
      needsFulfillment,
      stripeQueue,
      unpaidOrders,
      lowStockRows,
      overdueInvoices,
      openReturns,
      pendingClients,
    ] = await Promise.all([
      // Paid sales (last 30d) with no tracking yet — the "ship it" queue.
      prisma.salesRecord.count({
        where: { invoicePaid: true, trackingNumber: '', date: { gte: since } },
      }),
      // External Stripe payments not yet converted to fulfillable orders.
      prisma.salesRecord.count({
        where: { source: 'stripe', orderId: null, invoicePaid: true, date: { gte: since } },
      }),
      // Live orders whose payment still needs collecting or retrying.
      prisma.order.count({
        where: {
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          paymentStatus: { in: ['PENDING', 'AUTHORIZED', 'FAILED'] },
          createdAt: { gte: since },
        },
      }),
      // Sellable stock at/below the reorder level (reorderLevel 0 = untracked).
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM "ProductVariant"
        WHERE status = 'ACTIVE' AND "reorderLevel" > 0
          AND ("inventoryOnHand" - "inventoryReserved") <= "reorderLevel"
      `,
      // Issued invoices past due (or already flagged overdue).
      prisma.invoice.count({
        where: {
          OR: [
            { status: 'OVERDUE' },
            { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: now } },
          ],
        },
      }),
      prisma.returnRequest.count({
        where: { status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED', 'INSPECTED'] } },
      }),
      prisma.client.count({ where: { onboardingStatus: { in: ['PENDING', 'NEEDS_INFO'] } } }),
    ])

    return successResponse({
      windowDays: WINDOW_DAYS,
      needsFulfillment,
      stripeQueue,
      unpaidOrders,
      lowStock: Number(lowStockRows[0]?.count ?? 0),
      overdueInvoices,
      openReturns,
      pendingClients,
    })
  } catch (error) {
    logger.error(
      '[dashboard/ops] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load ops summary')
  }
}
