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
import { StripeConfigError } from '@/lib/stripe/config'
import { issueOrderRefund, OrderRefundError } from '@/lib/orders/refund'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — refundability snapshot for the refund dialog. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        orderNumber: true,
        total: true,
        refundedTotal: true,
        paymentStatus: true,
        stripePaymentIntentId: true,
      },
    })
    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')

    const total = Number(order.total)
    const refundedTotal = Number(order.refundedTotal)
    return successResponse({
      orderNumber: order.orderNumber,
      total,
      refundedTotal,
      remaining: Math.max(0, total - refundedTotal),
      paymentStatus: order.paymentStatus,
      hasStripePayment: Boolean(order.stripePaymentIntentId),
    })
  } catch (error) {
    logger.error('[REFUND] GET error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load refund info')
  }
}

const bodySchema = z.object({
  /** Refund amount in dollars. Omit for a full (remaining) refund. */
  amount: z.number().positive().max(1_000_000).optional(),
  reason: z.enum(['requested_by_customer', 'duplicate', 'fraudulent']).optional(),
})

/**
 * POST /api/admin/orders/[id]/refund — programmatic Stripe refund.
 *
 * Refunds the order's PaymentIntent (full or partial), tracks the cumulative
 * `refundedTotal` on the order, flips paymentStatus to REFUNDED and releases
 * reservations when fully refunded, and re-syncs the SalesRecord so dashboard
 * revenue nets out the refund. Idempotent per (order, cumulative position):
 * retrying the same refund reuses the same Stripe idempotency key.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const result = await issueOrderRefund(id, {
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      refundedBy: userId ?? null,
    })
    return successResponse(result)
  } catch (error) {
    if (error instanceof OrderRefundError) {
      return errorResponse(error.message, error.status, error.code)
    }
    if (error instanceof StripeConfigError) {
      return errorResponse('Payments are not configured', 503, error.code)
    }
    logger.error('[REFUND] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to issue refund')
  }
}
