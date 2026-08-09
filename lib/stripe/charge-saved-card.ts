/**
 * Off-session charge of a client's saved PaymentMethod for an existing Order.
 * Shared by admin Charge UI and Shopify paid-order ingest.
 */

import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { toCents } from '@/lib/stripe'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import { connectRequestOptions, applicationFeeAmount } from '@/lib/stripe/connect'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer'
import { reconcileOrderFromPaymentIntent } from '@/lib/stripe/payments'

export type ChargeSavedCardResult =
  | {
      status: 'captured'
      paymentIntentId: string
      paymentMethodId: string
      paymentStatus: string
    }
  | { status: 'no_card' }
  | {
      status: 'failed'
      message: string
      paymentIntentId?: string
      paymentStatus: string
    }
  | { status: 'requires_action'; paymentIntentId: string; clientSecret: string | null }
  | { status: 'already_paid' }
  | { status: 'not_found' }
  | { status: 'stripe_unconfigured'; message: string }

/**
 * Charge the client's default (or first active) saved card for `orderId`.
 * On Stripe decline, marks the order FAILED and returns `{ status: 'failed' }`
 * without throwing — callers (Shopify ingest) keep the warehouse order.
 */
export async function chargeOrderWithSavedCard(params: {
  orderId: string
  /** Prefer this PaymentMethod id when set; otherwise pick default/first active. */
  paymentMethodId?: string
  /** Extra PI metadata (e.g. source: shopify). */
  metadata?: Record<string, string>
  /** Idempotency key suffix — defaults to order id. */
  idempotencyKey?: string
}): Promise<ChargeSavedCardResult> {
  if (!prisma) return { status: 'not_found' }

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      orderNumber: true,
      clientId: true,
      total: true,
      paymentStatus: true,
    },
  })
  if (!order) return { status: 'not_found' }
  if (order.paymentStatus === 'CAPTURED') return { status: 'already_paid' }

  const saved = params.paymentMethodId
    ? await prisma.paymentMethod.findFirst({
        where: { id: params.paymentMethodId, clientId: order.clientId, isActive: true },
      })
    : await prisma.paymentMethod.findFirst({
        where: { clientId: order.clientId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }],
      })

  if (!saved) return { status: 'no_card' }

  let stripe: Stripe
  try {
    stripe = requireStripeClient()
  } catch (err) {
    const message =
      err instanceof StripeConfigError ? err.message : 'Payments are not configured'
    return { status: 'stripe_unconfigured', message }
  }

  const customer = await getOrCreateStripeCustomer(order.clientId)
  const amount = toCents(Number(order.total))
  const appFee = applicationFeeAmount(amount)

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: 'usd',
        customer: customer.id,
        description: `PeptSci order #${order.orderNumber}`,
        payment_method: saved.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        setup_future_usage: 'off_session',
        metadata: {
          orderId: order.id,
          clientId: order.clientId,
          ...(params.metadata ?? {}),
        },
        ...(appFee ? { application_fee_amount: appFee } : {}),
      },
      connectRequestOptions({
        idempotencyKey: params.idempotencyKey ?? `pi_saved_${order.id}`,
      })
    )
  } catch (err) {
    const stripeErr = err as { message?: string; payment_intent?: Stripe.PaymentIntent }
    const message = stripeErr.message ?? 'Payment failed'
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'FAILED',
        paymentFailureReason: message,
        stripePaymentIntentId: stripeErr.payment_intent?.id,
        paymentMethodId: saved.id,
      },
    })
    logger.warn('[charge-saved-card] off-session charge failed', {
      orderId: order.id,
      message,
    })
    return {
      status: 'failed',
      message,
      paymentIntentId: stripeErr.payment_intent?.id,
      paymentStatus: 'FAILED',
    }
  }

  await prisma.paymentMethod.update({
    where: { id: saved.id },
    data: { lastUsedAt: new Date() },
  })
  await prisma.order.update({
    where: { id: order.id },
    data: { stripePaymentIntentId: intent.id, paymentMethodId: saved.id },
  })

  if (intent.status === 'requires_action') {
    return {
      status: 'requires_action',
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
    }
  }

  const result = await reconcileOrderFromPaymentIntent(intent)
  const paymentStatus = result.paymentStatus ?? 'PENDING'
  if (paymentStatus !== 'CAPTURED') {
    return {
      status: 'failed',
      message: `Payment ${intent.status}`,
      paymentIntentId: intent.id,
      paymentStatus,
    }
  }

  return {
    status: 'captured',
    paymentIntentId: intent.id,
    paymentMethodId: saved.id,
    paymentStatus,
  }
}
