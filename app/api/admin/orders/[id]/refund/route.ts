import { NextRequest } from 'next/server'
import { z } from 'zod'
import type Stripe from 'stripe'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { toCents } from '@/lib/stripe'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { syncSalesRecordFromOrder } from '@/lib/sales'
import { releaseForOrder } from '@/lib/inventory/reservations'

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

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        refundedTotal: true,
        paymentStatus: true,
        stripePaymentIntentId: true,
      },
    })
    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')
    if (!order.stripePaymentIntentId) {
      return errorResponse(
        'This order has no Stripe payment to refund (billed to account or unpaid).',
        409,
        'NO_STRIPE_PAYMENT'
      )
    }
    if (order.paymentStatus !== 'CAPTURED' && order.paymentStatus !== 'REFUNDED') {
      return errorResponse(
        `Order payment is ${order.paymentStatus} — only captured payments can be refunded.`,
        409,
        'NOT_CAPTURED'
      )
    }

    const total = Number(order.total)
    const alreadyRefunded = Number(order.refundedTotal)
    const remaining = Math.max(0, total - alreadyRefunded)
    if (remaining <= 0) {
      return errorResponse('Order is already fully refunded.', 409, 'ALREADY_REFUNDED')
    }

    const amount = parsed.data.amount ?? remaining
    if (amount > remaining + 0.005) {
      return errorResponse(
        `Refund exceeds remaining balance: requested $${amount.toFixed(2)}, refundable $${remaining.toFixed(2)}.`,
        400,
        'AMOUNT_TOO_LARGE'
      )
    }
    const amountCents = toCents(amount)

    const stripe = requireStripeClient()
    let refund: Stripe.Refund
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: order.stripePaymentIntentId,
          amount: amountCents,
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
          metadata: { orderId: order.id, refundedBy: userId ?? 'unknown' },
        },
        // Cumulative position in the key: retries of THIS refund dedupe, while
        // a subsequent refund (after refundedTotal advanced) gets a fresh key.
        connectRequestOptions({
          idempotencyKey: `refund_${order.id}_${toCents(alreadyRefunded)}_${amountCents}`,
        })
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stripe refund failed'
      logger.error('[REFUND] Stripe refund failed', { orderId: order.id, message })
      return errorResponse(message, 402, 'STRIPE_REFUND_FAILED')
    }

    const newRefundedTotal = Math.min(total, alreadyRefunded + amount)
    const fullyRefunded = newRefundedTotal >= total - 0.005
    await prisma.order.update({
      where: { id: order.id },
      data: {
        refundedTotal: newRefundedTotal,
        refundedAt: new Date(),
        ...(fullyRefunded ? { paymentStatus: 'REFUNDED' } : {}),
      },
    })

    // Fully refunded goods will not ship — free the reserved stock.
    if (fullyRefunded) {
      await releaseForOrder(order.id).catch(() => {})
    }

    // Net the refund out of analytics (never blocks the refund).
    await syncSalesRecordFromOrder(order.id)

    logger.info('[REFUND] Refund issued', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      refundId: refund.id,
      amount,
      newRefundedTotal,
      fullyRefunded,
      by: userId,
    })

    return successResponse({
      refundId: refund.id,
      refundStatus: refund.status,
      amount,
      refundedTotal: newRefundedTotal,
      remaining: Math.max(0, total - newRefundedTotal),
      fullyRefunded,
      paymentStatus: fullyRefunded ? 'REFUNDED' : 'CAPTURED',
    })
  } catch (error) {
    if (error instanceof StripeConfigError) {
      return errorResponse('Payments are not configured', 503, error.code)
    }
    logger.error('[REFUND] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to issue refund')
  }
}
