/**
 * Programmatic Stripe refunds for orders, shared by the admin refund endpoint
 * and the returns workflow (RMA → REFUNDED must move real money, not just a
 * status). Tracks cumulative Order.refundedTotal, flips paymentStatus to
 * REFUNDED + releases reservations when fully refunded, and re-syncs the
 * SalesRecord so revenue nets the refund.
 */

import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { toCents } from '@/lib/stripe'
import { requireStripeClient } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { syncSalesRecordFromOrder } from '@/lib/sales'
import { releaseForOrder } from '@/lib/inventory/reservations'
import { reverseCommissionForOrder } from '@/lib/partners/accrual'

export class OrderRefundError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'OrderRefundError'
  }
}

export interface IssueOrderRefundInput {
  /** Refund amount in dollars. Omit for a full (remaining) refund. */
  amount?: number
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent'
  /** Actor recorded in Stripe metadata. */
  refundedBy?: string | null
}

export interface IssueOrderRefundResult {
  refundId: string
  refundStatus: string | null
  amount: number
  refundedTotal: number
  remaining: number
  fullyRefunded: boolean
  paymentStatus: 'REFUNDED' | 'CAPTURED'
}

/**
 * Issue a (full or partial) Stripe refund against an order's PaymentIntent.
 * Idempotent per (order, cumulative position): retrying the same refund reuses
 * the same Stripe idempotency key. Throws {@link OrderRefundError} for any
 * caller-fixable condition.
 */
export async function issueOrderRefund(
  orderId: string,
  input: IssueOrderRefundInput = {}
): Promise<IssueOrderRefundResult> {
  if (!prisma) throw new OrderRefundError('Database not connected', 'DB_UNAVAILABLE', 503)

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      refundedTotal: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
    },
  })
  if (!order) throw new OrderRefundError('Order not found', 'NOT_FOUND', 404)
  if (!order.stripePaymentIntentId) {
    throw new OrderRefundError(
      'This order has no Stripe payment to refund (billed to account or unpaid).',
      'NO_STRIPE_PAYMENT',
      409
    )
  }
  if (order.paymentStatus !== 'CAPTURED' && order.paymentStatus !== 'REFUNDED') {
    throw new OrderRefundError(
      `Order payment is ${order.paymentStatus} — only captured payments can be refunded.`,
      'NOT_CAPTURED',
      409
    )
  }

  const total = Number(order.total)
  const alreadyRefunded = Number(order.refundedTotal)
  const remaining = Math.max(0, total - alreadyRefunded)
  if (remaining <= 0) {
    throw new OrderRefundError('Order is already fully refunded.', 'ALREADY_REFUNDED', 409)
  }

  const amount = input.amount ?? remaining
  if (!(amount > 0)) {
    throw new OrderRefundError('Refund amount must be positive.', 'AMOUNT_INVALID', 400)
  }
  if (amount > remaining + 0.005) {
    throw new OrderRefundError(
      `Refund exceeds remaining balance: requested $${amount.toFixed(2)}, refundable $${remaining.toFixed(2)}.`,
      'AMOUNT_TOO_LARGE',
      400
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
        ...(input.reason ? { reason: input.reason } : {}),
        metadata: { orderId: order.id, refundedBy: input.refundedBy ?? 'unknown' },
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
    throw new OrderRefundError(message, 'STRIPE_REFUND_FAILED', 402)
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

  // Claw back partner commission proportionally (never blocks the refund).
  await reverseCommissionForOrder(order.id)

  logger.info('[REFUND] Refund issued', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    refundId: refund.id,
    amount,
    newRefundedTotal,
    fullyRefunded,
    by: input.refundedBy ?? null,
  })

  return {
    refundId: refund.id,
    refundStatus: refund.status ?? null,
    amount,
    refundedTotal: newRefundedTotal,
    remaining: Math.max(0, total - newRefundedTotal),
    fullyRefunded,
    paymentStatus: fullyRefunded ? 'REFUNDED' : 'CAPTURED',
  }
}
