/**
 * Apply a Stripe charge.refunded event to a platform Order.
 *
 * Lookups: Order.stripeChargeId → Order.stripePaymentIntentId → InvoicePayment
 * PI → SalesRecord PI. Full refunds mark REFUNDED, reverse commission/credit,
 * release stock, and cancel pre-ship fulfillment so the order leaves the queue.
 */

import type Stripe from 'stripe'
import { PaymentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { releaseForOrder } from '@/lib/inventory/reservations'
import { syncSalesRecordFromOrder } from '@/lib/sales'
import { reverseCommissionForOrder } from '@/lib/partners/accrual'
import { reverseReferralCreditForOrder } from '@/lib/referrals/credit'
import { assessOrderCancel, cancelOrder, OrderCancelError } from '@/lib/orders/cancel'

export type ApplyStripeChargeRefundResult = {
  orderMatched: boolean
  orderId?: string
  fullyRefunded: boolean
  cancelled: boolean
  cancelSkippedReason?: string
  amountRefunded: number
}

/** Pure: should this charge state cancel fulfillment? */
export function shouldCancelFulfillmentOnStripeRefund(input: {
  fullyRefunded: boolean
  orderStatus: string
  trackingNumber?: string | null
  shippingStatus?: string | null
}): { cancel: true } | { cancel: false; reason: string } {
  if (!input.fullyRefunded) {
    return { cancel: false, reason: 'partial_refund' }
  }
  const gate = assessOrderCancel({
    status: input.orderStatus,
    trackingNumber: input.trackingNumber,
    shippingStatus: input.shippingStatus,
  })
  if (!gate.allowed) {
    return { cancel: false, reason: gate.code.toLowerCase() }
  }
  return { cancel: true }
}

function paymentIntentIdFromCharge(charge: Stripe.Charge): string | null {
  const pi = charge.payment_intent
  if (typeof pi === 'string' && pi.trim()) return pi
  if (pi && typeof pi === 'object' && 'id' in pi && typeof pi.id === 'string') return pi.id
  return null
}

/**
 * Find the Order that owns this Stripe charge (direct card, invoice white-label,
 * or SalesRecord link).
 */
export async function findOrderForStripeCharge(charge: Stripe.Charge): Promise<{
  id: string
  status: string
  trackingNumber: string | null
  shippingStatus: string | null
  stripeChargeId: string | null
  stripePaymentIntentId: string | null
} | null> {
  if (!prisma) return null

  const piId = paymentIntentIdFromCharge(charge)

  const byCharge = await prisma.order.findFirst({
    where: { stripeChargeId: charge.id },
    select: {
      id: true,
      status: true,
      trackingNumber: true,
      shippingStatus: true,
      stripeChargeId: true,
      stripePaymentIntentId: true,
    },
  })
  if (byCharge) return byCharge

  if (piId) {
    const byPi = await prisma.order.findFirst({
      where: { stripePaymentIntentId: piId },
      select: {
        id: true,
        status: true,
        trackingNumber: true,
        shippingStatus: true,
        stripeChargeId: true,
        stripePaymentIntentId: true,
      },
    })
    if (byPi) return byPi

    const invoicePayment = await prisma.invoicePayment.findUnique({
      where: { stripePaymentIntentId: piId },
      select: { invoiceId: true },
    })
    if (invoicePayment) {
      const line = await prisma.invoiceLineItem.findFirst({
        where: { invoiceId: invoicePayment.invoiceId, orderId: { not: null } },
        select: { orderId: true },
        orderBy: { createdAt: 'asc' },
      })
      if (line?.orderId) {
        const byInvoice = await prisma.order.findUnique({
          where: { id: line.orderId },
          select: {
            id: true,
            status: true,
            trackingNumber: true,
            shippingStatus: true,
            stripeChargeId: true,
            stripePaymentIntentId: true,
          },
        })
        if (byInvoice) return byInvoice
      }
    }

    const sale = await prisma.salesRecord.findUnique({
      where: { stripePaymentIntentId: piId },
      select: { orderId: true },
    })
    if (sale?.orderId) {
      return prisma.order.findUnique({
        where: { id: sale.orderId },
        select: {
          id: true,
          status: true,
          trackingNumber: true,
          shippingStatus: true,
          stripeChargeId: true,
          stripePaymentIntentId: true,
        },
      })
    }
  }

  return null
}

/**
 * Sync platform Order state from a Stripe charge.refunded event.
 * Full refund → REFUNDED + cancel fulfillment when still pre-ship.
 */
export async function applyStripeChargeRefund(
  charge: Stripe.Charge
): Promise<ApplyStripeChargeRefundResult> {
  const amountRefunded = charge.amount_refunded ?? 0
  const fullyRefunded = amountRefunded >= (charge.amount ?? 0) && (charge.amount ?? 0) > 0
  const base: ApplyStripeChargeRefundResult = {
    orderMatched: false,
    fullyRefunded,
    cancelled: false,
    amountRefunded,
  }

  if (!prisma) return base

  const order = await findOrderForStripeCharge(charge)
  if (!order) return base

  const piId = paymentIntentIdFromCharge(charge)

  // Persist Stripe ids when we resolved via invoice/SalesRecord so later
  // lookups (and dashboard refunds) stay linked.
  await prisma.order.update({
    where: { id: order.id },
    data: {
      refundedTotal: amountRefunded / 100,
      refundedAt: new Date(),
      ...(fullyRefunded ? { paymentStatus: PaymentStatus.REFUNDED } : {}),
      ...(!order.stripeChargeId ? { stripeChargeId: charge.id } : {}),
      ...(!order.stripePaymentIntentId && piId ? { stripePaymentIntentId: piId } : {}),
    },
  })

  await syncSalesRecordFromOrder(order.id)
  await reverseCommissionForOrder(order.id).catch(() => {})
  await reverseReferralCreditForOrder(order.id).catch(() => {})

  if (fullyRefunded) {
    await releaseForOrder(order.id).catch(() => {})
  } else {
    logger.warn('[STRIPE REFUND] Partial refund — order left active', {
      orderId: order.id,
      chargeId: charge.id,
      amount: charge.amount,
      amountRefunded,
    })
  }

  const decision = shouldCancelFulfillmentOnStripeRefund({
    fullyRefunded,
    orderStatus: order.status,
    trackingNumber: order.trackingNumber,
    shippingStatus: order.shippingStatus,
  })

  if (!decision.cancel) {
    return {
      ...base,
      orderMatched: true,
      orderId: order.id,
      cancelSkippedReason: decision.reason,
    }
  }

  try {
    await cancelOrder(order.id, {
      reason: 'stripe_refund',
      notePrefix: 'Refunded on Stripe',
      refund: false, // money already moved in Stripe Dashboard
      cancelledBy: 'stripe_webhook',
    })
    return {
      ...base,
      orderMatched: true,
      orderId: order.id,
      cancelled: true,
    }
  } catch (e) {
    if (e instanceof OrderCancelError && e.code === 'ALREADY_CANCELLED') {
      return {
        ...base,
        orderMatched: true,
        orderId: order.id,
        cancelled: false,
        cancelSkippedReason: 'already_cancelled',
      }
    }
    logger.warn('[STRIPE REFUND] cancel after refund failed (non-blocking)', {
      orderId: order.id,
      chargeId: charge.id,
      error: e instanceof Error ? e.message : String(e),
    })
    return {
      ...base,
      orderMatched: true,
      orderId: order.id,
      cancelled: false,
      cancelSkippedReason: 'cancel_failed',
    }
  }
}
