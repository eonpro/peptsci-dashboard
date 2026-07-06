/**
 * Stripe Webhook Handler (adapted from EonPro's bulletproof pattern).
 *
 * Rules:
 * 1. NEVER return 500 to Stripe (avoids retry storms) — always 200 once the
 *    signature is verified; failures are recorded for manual review.
 * 2. Verify the signature before any processing.
 * 3. Idempotent on Stripe event id via the WebhookEvent table.
 * 4. Reconcile orders/payment methods from the event payload.
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import type Stripe from 'stripe'
import { PaymentStatus, WebhookEventStatus } from '@prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getStripeClient, getStripeWebhookSecret } from '@/lib/stripe/config'
import { getConnectedAccountId } from '@/lib/stripe/connect'
import {
  reconcileOrderFromPaymentIntent,
  persistPaymentMethodFromStripe,
} from '@/lib/stripe/payments'
import { releaseForOrder } from '@/lib/inventory/reservations'

export const dynamic = 'force-dynamic'

interface ProcessResult {
  success: boolean
  error?: string
  details?: Record<string, unknown>
  /**
   * When true, a failure is considered transient (e.g. the order isn't linked
   * yet) and we return a 5xx so Stripe retries. When false/absent, failures are
   * recorded but acknowledged with a 200 (no retry storm).
   */
  retryable?: boolean
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('Unique constraint') || message.includes('eventId')
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  const stripe = getStripeClient()
  const webhookSecret = getStripeWebhookSecret()
  if (!stripe || !webhookSecret) {
    logger.error('[STRIPE WEBHOOK] Not configured (missing key or webhook secret)')
    return NextResponse.json({ error: 'Stripe webhook not configured' }, { status: 503 })
  }

  const body = await request.text()
  const signature = (await headers()).get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    logger.error('[STRIPE WEBHOOK] Signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Connect: the platform endpoint receives events for ALL connected accounts.
  // Only process events for our monitored connected account; skip everything
  // else (other clinics + platform-level events) with a 200 so Stripe doesn't
  // retry. When no connected account is configured, process everything in dev,
  // but FAIL CLOSED in production (a missing account id must not cause us to
  // process events for arbitrary connected accounts).
  const monitoredAccount = getConnectedAccountId()
  if (monitoredAccount) {
    if (event.account !== monitoredAccount) {
      return NextResponse.json({ received: true, skipped: 'account_not_monitored' })
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.error('[STRIPE WEBHOOK] No connected account configured in production; skipping', {
      eventId: event.id,
      eventAccount: event.account,
    })
    return NextResponse.json({ received: true, processed: false, reason: 'no_monitored_account' })
  }

  if (!prisma) {
    // Can't dedupe/record without a DB; report received so Stripe doesn't retry forever.
    logger.error('[STRIPE WEBHOOK] DB unavailable; cannot process', { eventId: event.id })
    return NextResponse.json({ received: true, processed: false, reason: 'db_unavailable' })
  }

  // Idempotency claim: atomically insert the event row up-front. The unique
  // `eventId` makes this the single source of truth for "who owns processing",
  // closing the check-then-act race between two concurrent deliveries. If the
  // row already exists we either skip (already SUCCESS / in flight) or reclaim a
  // prior ERROR for retry via a conditional update.
  let claimed = false
  try {
    await prisma.webhookEvent.create({
      data: {
        eventId: event.id,
        source: 'stripe',
        eventType: event.type,
        status: WebhookEventStatus.RECEIVED,
        payload: event as unknown as object,
      },
    })
    claimed = true
  } catch (createErr) {
    if (!isUniqueViolation(createErr)) {
      // DB unavailable / table missing — acknowledge so Stripe doesn't storm.
      logger.error('[STRIPE WEBHOOK] Claim insert failed (acknowledging)', {
        eventId: event.id,
        error: createErr instanceof Error ? createErr.message : String(createErr),
      })
      return NextResponse.json({ received: true, processed: false, reason: 'claim_failed' })
    }
    // Row exists: another delivery got here first. Only reclaim a prior ERROR.
    const existing = await prisma.webhookEvent
      .findUnique({ where: { eventId: event.id }, select: { status: true } })
      .catch(() => null)
    if (existing?.status === WebhookEventStatus.SUCCESS) {
      return NextResponse.json({ received: true, processed: true, duplicate: true })
    }
    // Attempt to reclaim an ERRORed row for retry; if another worker already
    // reclaimed it (RECEIVED) this update affects 0 rows and we back off.
    const reclaim = await prisma.webhookEvent.updateMany({
      where: { eventId: event.id, status: WebhookEventStatus.ERROR },
      data: { status: WebhookEventStatus.RECEIVED, retryCount: { increment: 1 } },
    })
    if (reclaim.count === 0) {
      return NextResponse.json({ received: true, processed: false, duplicate: true, inFlight: true })
    }
    claimed = true
  }

  let result: ProcessResult
  try {
    result = await processEvent(event)
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }

  const processingMs = Date.now() - startTime

  // Finalize the claimed row with the outcome (audit / DLQ on failure).
  if (claimed) {
    try {
      await prisma.webhookEvent.update({
        where: { eventId: event.id },
        data: {
          status: result.success ? WebhookEventStatus.SUCCESS : WebhookEventStatus.ERROR,
          errorMessage: result.error ?? null,
          processingMs,
          processedAt: result.success ? new Date() : null,
        },
      })
    } catch (logErr) {
      logger.error('[STRIPE WEBHOOK] Failed to finalize WebhookEvent', {
        eventId: event.id,
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    }
  }

  if (result.success) {
    logger.info('[STRIPE WEBHOOK] Processed', {
      eventId: event.id,
      eventType: event.type,
      processingMs,
      ...result.details,
    })
  } else {
    logger.error('[STRIPE WEBHOOK] Processing failed (recorded for review)', {
      eventId: event.id,
      eventType: event.type,
      error: result.error,
      retryable: result.retryable ?? false,
    })
  }

  // Transient failures (e.g. payment not yet linked to an order) return 5xx so
  // Stripe retries within its window; the ERROR row lets the next delivery
  // reclaim and reprocess. Everything else is acknowledged with 200.
  if (!result.success && result.retryable) {
    return NextResponse.json(
      { received: true, processed: false, retry: true, eventId: event.id },
      { status: 503 }
    )
  }

  return NextResponse.json({ received: true, processed: result.success, eventId: event.id })
}

async function processEvent(event: Stripe.Event): Promise<ProcessResult> {
  if (!prisma) return { success: false, error: 'DB unavailable' }

  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled':
    case 'payment_intent.processing': {
      const pi = event.data.object as Stripe.PaymentIntent
      const res = await reconcileOrderFromPaymentIntent(pi)
      // A successful payment with no matching order is a real problem (bad
      // metadata, order not linked yet, or deleted order). Fail as retryable so
      // Stripe retries — a later delivery can match once the link is written,
      // and a persistent failure is captured in the WebhookEvent DLQ.
      if (!res.matched && (pi.status === 'succeeded' || pi.status === 'processing')) {
        return {
          success: false,
          retryable: true,
          error: `No order matched for PaymentIntent ${pi.id}`,
          details: { paymentIntentId: pi.id, matched: false, paymentStatus: pi.status },
        }
      }
      return {
        success: true,
        details: { paymentIntentId: pi.id, matched: res.matched, paymentStatus: res.paymentStatus },
      }
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const order = await prisma.order.findFirst({ where: { stripeChargeId: charge.id } })
      // Only a FULL refund flips the order to REFUNDED and frees reservations.
      // A partial refund leaves the order active/shippable (there is no partial
      // enum state) — otherwise the remaining goods would be un-reserved and
      // could be oversold. Partial refunds are recorded via logs for review.
      const fullyRefunded = charge.amount_refunded >= charge.amount
      if (order && fullyRefunded) {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatus.REFUNDED },
        })
        // Free any stock reserved for this order (non-blocking).
        await releaseForOrder(order.id).catch(() => {})
      } else if (order && !fullyRefunded) {
        logger.warn('[STRIPE WEBHOOK] Partial refund — order left active', {
          orderId: order.id,
          chargeId: charge.id,
          amount: charge.amount,
          amountRefunded: charge.amount_refunded,
        })
      }
      return {
        success: true,
        details: {
          chargeId: charge.id,
          orderMatched: !!order,
          fullyRefunded,
          amountRefunded: charge.amount_refunded,
        },
      }
    }

    case 'payment_method.attached': {
      const pm = event.data.object as Stripe.PaymentMethod
      const customerId = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id
      if (!customerId) return { success: true, details: { skipped: 'no customer' } }
      const client = await prisma.client.findUnique({ where: { stripeCustomerId: customerId } })
      if (client) {
        await persistPaymentMethodFromStripe({
          clientId: client.id,
          stripePaymentMethodId: pm.id,
          // Connect events carry the connected account the object lives on.
          stripeAccount: event.account,
        })
      }
      return { success: true, details: { paymentMethodId: pm.id, clientMatched: !!client } }
    }

    case 'payment_method.detached': {
      const pm = event.data.object as Stripe.PaymentMethod
      await prisma.paymentMethod.updateMany({
        where: { stripePaymentMethodId: pm.id },
        data: { isActive: false },
      })
      return { success: true, details: { paymentMethodId: pm.id } }
    }

    default:
      return { success: true, details: { skipped: true, reason: 'Unhandled event type' } }
  }
}
