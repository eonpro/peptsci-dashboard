/**
 * Retail storefront payment reconciliation.
 *
 * Public storefront checkouts create a RetailOrder plus a Stripe PaymentIntent
 * carrying `metadata.retailOrderId`. This mirrors the B2B order reconcile in
 * lib/stripe/payments.ts, scoped to the retail tables: map the PI status onto
 * RetailOrder.paymentStatus and flip the order to CONFIRMED when captured.
 * Idempotent — safe across webhook retries and the client confirm endpoint.
 */

import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { mapPaymentIntentStatus } from '@/lib/stripe/payments'

export interface RetailReconcileResult {
  matched: boolean
  paymentStatus?: string
}

export async function reconcileRetailOrderFromPaymentIntent(
  pi: Stripe.PaymentIntent
): Promise<RetailReconcileResult> {
  if (!prisma) return { matched: false }

  const retailOrderId = pi.metadata?.retailOrderId
  const order = retailOrderId
    ? await prisma.retailOrder.findUnique({ where: { id: retailOrderId } })
    : await prisma.retailOrder.findUnique({ where: { stripePaymentIntentId: pi.id } })
  if (!order) return { matched: false }

  const paymentStatus = mapPaymentIntentStatus(pi.status, pi.last_payment_error)

  // Fail closed on amount mismatch (same rule as the B2B reconcile): a PI that
  // charged a different amount than the order total must not mark it paid.
  if (paymentStatus === 'CAPTURED') {
    const expected = Math.round(Number(order.total) * 100)
    const charged = pi.amount_received || pi.amount
    if (charged !== expected) {
      logger.error('[RETAIL PAY] amount mismatch — not marking paid', {
        retailOrderId: order.id,
        expected,
        charged,
        paymentIntentId: pi.id,
      })
      return { matched: true, paymentStatus: order.paymentStatus }
    }
  }

  await prisma.retailOrder.update({
    where: { id: order.id },
    data: {
      paymentStatus,
      stripePaymentIntentId: pi.id,
      ...(paymentStatus === 'CAPTURED'
        ? {
            paidAt: order.paidAt ?? new Date(),
            // Only promote PENDING orders; never regress later states
            // (PROCESSING/SHIPPED/…) on webhook replays.
            ...(order.status === 'PENDING' ? { status: 'CONFIRMED' as const } : {}),
          }
        : {}),
    },
  })

  return { matched: true, paymentStatus }
}
