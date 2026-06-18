/**
 * Shared Stripe payment helpers: status mapping, order reconciliation,
 * saved-card persistence, and off-session charging.
 *
 * Used by /api/shop/checkout/process, /confirm, the webhook, and admin
 * off-session reorders so payment-state transitions live in one place.
 */

import type Stripe from 'stripe'
import { PaymentStatus, type Order } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireStripeClient } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { logger } from '@/lib/logger'
import { syncSalesRecordFromOrder } from '@/lib/sales'

/**
 * Map a Stripe PaymentIntent status to our PaymentStatus enum.
 * `requires_payment_method` with a recorded error means the last attempt
 * failed; without an error it's simply awaiting payment (PENDING).
 */
export function mapPaymentIntentStatus(
  status: Stripe.PaymentIntent.Status,
  lastPaymentError?: Stripe.PaymentIntent.LastPaymentError | null
): PaymentStatus {
  switch (status) {
    case 'succeeded':
      return PaymentStatus.CAPTURED
    case 'requires_capture':
      return PaymentStatus.AUTHORIZED
    case 'processing':
      return PaymentStatus.AUTHORIZED
    case 'canceled':
      return PaymentStatus.FAILED
    case 'requires_payment_method':
      return lastPaymentError ? PaymentStatus.FAILED : PaymentStatus.PENDING
    case 'requires_confirmation':
    case 'requires_action':
    default:
      return PaymentStatus.PENDING
  }
}

function chargeIdFromIntent(pi: Stripe.PaymentIntent): string | undefined {
  const latest = pi.latest_charge
  if (!latest) return undefined
  return typeof latest === 'string' ? latest : latest.id
}

export interface ReconcileResult {
  orderId?: string
  paymentStatus?: PaymentStatus
  matched: boolean
}

/**
 * Reconcile an Order's payment state from a Stripe PaymentIntent. Idempotent:
 * safe to call from both the confirm endpoint and the webhook for the same PI.
 * Locates the order by `metadata.orderId`, falling back to stripePaymentIntentId.
 */
export async function reconcileOrderFromPaymentIntent(
  pi: Stripe.PaymentIntent
): Promise<ReconcileResult> {
  if (!prisma) throw new Error('Database not connected')

  const metaOrderId = pi.metadata?.orderId
  let order: Order | null = null
  if (metaOrderId) {
    order = await prisma.order.findUnique({ where: { id: metaOrderId } })
  }
  if (!order) {
    order = await prisma.order.findFirst({ where: { stripePaymentIntentId: pi.id } })
  }
  if (!order) {
    logger.warn('[STRIPE] No order matched for PaymentIntent', { paymentIntentId: pi.id })
    return { matched: false }
  }

  const paymentStatus = mapPaymentIntentStatus(pi.status, pi.last_payment_error)
  const isCaptured = paymentStatus === PaymentStatus.CAPTURED
  const isFailed = paymentStatus === PaymentStatus.FAILED

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus,
      stripePaymentIntentId: pi.id,
      stripeChargeId: chargeIdFromIntent(pi),
      paymentFailureReason: isFailed ? (pi.last_payment_error?.message ?? 'Payment failed') : null,
      // Advance to SUBMITTED on capture (only from DRAFT so we never regress).
      ...(isCaptured && order.status === 'DRAFT'
        ? { status: 'SUBMITTED', submittedAt: new Date() }
        : {}),
      ...(isCaptured && !order.paidAt ? { paidAt: new Date() } : {}),
    },
  })

  logger.info('[STRIPE] Reconciled order from PaymentIntent', {
    orderId: order.id,
    paymentIntentId: pi.id,
    paymentStatus,
  })

  // Mirror captured orders into SalesRecord so analytics (dashboard, customers,
  // P&L, search) reflect platform sales. Idempotent (upsert keyed by orderId);
  // never allowed to break the payment flow.
  if (isCaptured) {
    await syncSalesRecordFromOrder(order.id)
  }

  return { orderId: order.id, paymentStatus, matched: true }
}

/**
 * Persist (upsert) a saved card from a Stripe PaymentMethod onto a client.
 * Only display fields are stored — never the PAN.
 */
export async function persistPaymentMethodFromStripe(params: {
  clientId: string
  stripePaymentMethodId: string
  makeDefault?: boolean
  /**
   * Connected account the PaymentMethod lives on. Defaults to the configured
   * connected account; webhooks should pass `event.account` explicitly.
   */
  stripeAccount?: string
}) {
  if (!prisma) throw new Error('Database not connected')
  const stripe = requireStripeClient()

  const requestOptions = params.stripeAccount
    ? { stripeAccount: params.stripeAccount }
    : connectRequestOptions()
  const pm = await stripe.paymentMethods.retrieve(
    params.stripePaymentMethodId,
    undefined,
    requestOptions
  )
  const card = pm.card

  const existingCount = await prisma.paymentMethod.count({
    where: { clientId: params.clientId, isActive: true },
  })
  const isDefault = params.makeDefault ?? existingCount === 0

  const saved = await prisma.paymentMethod.upsert({
    where: { stripePaymentMethodId: params.stripePaymentMethodId },
    update: {
      cardBrand: card?.brand,
      cardLast4: card?.last4,
      expiryMonth: card?.exp_month,
      expiryYear: card?.exp_year,
      cardholderName: pm.billing_details?.name ?? undefined,
      billingZip: pm.billing_details?.address?.postal_code ?? undefined,
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      clientId: params.clientId,
      stripePaymentMethodId: params.stripePaymentMethodId,
      cardBrand: card?.brand,
      cardLast4: card?.last4,
      expiryMonth: card?.exp_month,
      expiryYear: card?.exp_year,
      cardholderName: pm.billing_details?.name ?? undefined,
      billingZip: pm.billing_details?.address?.postal_code ?? undefined,
      isDefault,
      isActive: true,
      lastUsedAt: new Date(),
    },
  })

  logger.info('[STRIPE] Saved payment method for client', {
    clientId: params.clientId,
    paymentMethodId: saved.id,
    brand: card?.brand,
    last4: card?.last4,
  })

  return saved
}
