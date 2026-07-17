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
import { releaseForOrder, reserveForOrder } from '@/lib/inventory/reservations'
import { toCents } from '@/lib/stripe'
import { sendOrderConfirmationForOrder } from '@/lib/orders/confirmation-email'
import { notifyAdmins } from '@/lib/notifications/service'
import { accrueCommissionForOrder } from '@/lib/partners/accrual'

/**
 * Monotonic "progress" rank for a payment status. Used to prevent an
 * out-of-order webhook (e.g. a delayed `payment_intent.processing` arriving
 * after `succeeded`) from regressing a captured/refunded order backwards.
 */
const STATUS_RANK: Record<PaymentStatus, number> = {
  [PaymentStatus.PENDING]: 0,
  [PaymentStatus.AUTHORIZED]: 1,
  [PaymentStatus.FAILED]: 1,
  [PaymentStatus.CAPTURED]: 3,
  [PaymentStatus.REFUNDED]: 4,
}

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

  const mappedStatus = mapPaymentIntentStatus(pi.status, pi.last_payment_error)

  // Monotonic guard: never let a stale/out-of-order event move the order to a
  // lower-progress status than it already has (e.g. a late `processing` event
  // must not downgrade an order that already `succeeded`). REFUNDED is terminal
  // for this path (refunds are handled by the charge.refunded handler).
  const currentRank = STATUS_RANK[order.paymentStatus]
  const isRegression = STATUS_RANK[mappedStatus] < currentRank
  const paymentStatus = isRegression ? order.paymentStatus : mappedStatus
  if (isRegression) {
    logger.warn('[STRIPE] Ignored out-of-order payment status regression', {
      orderId: order.id,
      paymentIntentId: pi.id,
      current: order.paymentStatus,
      incoming: mappedStatus,
    })
  }

  // Amount verification: the amount Stripe actually processed must match the
  // server-computed order total. A mismatch means the PI was created/edited
  // out-of-band — FAIL CLOSED: do not mark the order captured, do not advance
  // it, do not reserve stock. Ops must reconcile manually (refund or fix).
  const expectedCents = toCents(Number(order.total))
  const amountMismatch =
    paymentStatus === PaymentStatus.CAPTURED &&
    typeof pi.amount === 'number' &&
    pi.amount !== expectedCents
  if (amountMismatch) {
    logger.error('[STRIPE] PaymentIntent amount does not match order total — refusing capture', {
      orderId: order.id,
      paymentIntentId: pi.id,
      piAmount: pi.amount,
      expectedCents,
    })
    await prisma.order.update({
      where: { id: order.id },
      data: {
        stripePaymentIntentId: pi.id,
        stripeChargeId: chargeIdFromIntent(pi),
        paymentFailureReason: `Amount mismatch: charged ${pi.amount}¢, expected ${expectedCents}¢ — needs manual reconciliation`,
      },
    })
    return { orderId: order.id, paymentStatus: order.paymentStatus, matched: true }
  }

  const isCaptured = paymentStatus === PaymentStatus.CAPTURED
  const isFailed = paymentStatus === PaymentStatus.FAILED
  // ACH debits sit in `processing` (AUTHORIZED) for days. The buyer has
  // committed — the order must be visible in their history (not a hidden
  // DRAFT), while the pay-before-ship gate still holds until capture.
  const isAuthorized = paymentStatus === PaymentStatus.AUTHORIZED

  // First-capture detection (atomic): claim paidAt only while it is still null
  // so concurrent deliveries (confirm endpoint + webhook) can't both treat the
  // capture as "first" — the confirmation email must send exactly once.
  let firstCapture = false
  if (isCaptured && !order.paidAt) {
    const claim = await prisma.order.updateMany({
      where: { id: order.id, paidAt: null },
      data: { paidAt: new Date() },
    })
    firstCapture = claim.count === 1
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus,
      stripePaymentIntentId: pi.id,
      stripeChargeId: chargeIdFromIntent(pi),
      paymentFailureReason: isFailed ? (pi.last_payment_error?.message ?? 'Payment failed') : null,
      // Advance to SUBMITTED on capture or ACH-processing (only from DRAFT so
      // we never regress).
      ...((isCaptured || isAuthorized) && order.status === 'DRAFT'
        ? { status: 'SUBMITTED', submittedAt: new Date() }
        : {}),
    },
  })

  logger.info('[STRIPE] Reconciled order from PaymentIntent', {
    orderId: order.id,
    paymentIntentId: pi.id,
    paymentStatus,
  })

  // A failed payment on a still-DRAFT order frees any stock reserved by the
  // enforced-checkout path (idempotent no-op when nothing was reserved).
  if (isFailed && order.status === 'DRAFT') {
    await releaseForOrder(order.id).catch((e) =>
      logger.warn('[STRIPE] releaseForOrder after failure failed (non-blocking)', {
        orderId: order.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )
  }

  // Mirror captured orders into SalesRecord so analytics (dashboard, customers,
  // P&L, search) reflect platform sales. Idempotent (upsert keyed by orderId);
  // never allowed to break the payment flow.
  if (isCaptured) {
    await syncSalesRecordFromOrder(order.id)
    // Affiliate commission accrual for partner-attributed clinics. Idempotent
    // (unique per order) and never allowed to break the payment flow.
    await accrueCommissionForOrder(order.id)
    // Reserve stock against the now-committed order. Idempotent and never
    // allowed to break the payment flow.
    await reserveForOrder(order.id).catch((e) =>
      logger.warn('[STRIPE] reserveForOrder failed (non-blocking)', {
        orderId: order.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )
    // Confirmation email + ops alert on the first capture only. Fire-and-forget;
    // neither is allowed to fail the payment flow. notifyAdmins additionally
    // dedupes on (sourceType, sourceId) per admin, so a webhook redelivery that
    // somehow re-claims first-capture still can't double-notify.
    if (firstCapture) {
      void sendOrderConfirmationForOrder(order.id, { paymentLabel: 'Paid by card' })
      const total = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(Number(order.total))
      const client = await prisma.client.findUnique({
        where: { id: order.clientId },
        select: { organizationName: true },
      })
      notifyAdmins({
        category: 'ORDER',
        priority: 'HIGH',
        title: `New order #${order.orderNumber} — ${total} (paid)`,
        message: `${client?.organizationName ?? 'A client'} placed order #${order.orderNumber}; payment captured. Ready for fulfillment.`,
        actionUrl: '/fulfillment',
        sourceType: 'order:placed',
        sourceId: order.id,
        clientId: order.clientId,
      }).catch((e) =>
        logger.warn('[STRIPE] admin notify failed (non-blocking)', {
          orderId: order.id,
          error: e instanceof Error ? e.message : String(e),
        })
      )
    }
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
