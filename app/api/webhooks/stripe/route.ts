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
  // retry. When no connected account is configured (dev), process everything.
  const monitoredAccount = getConnectedAccountId()
  if (monitoredAccount && event.account !== monitoredAccount) {
    return NextResponse.json({ received: true, skipped: 'account_not_monitored' })
  }

  if (!prisma) {
    // Can't dedupe/record without a DB; report received so Stripe doesn't retry forever.
    logger.error('[STRIPE WEBHOOK] DB unavailable; cannot process', { eventId: event.id })
    return NextResponse.json({ received: true, processed: false, reason: 'db_unavailable' })
  }

  // Idempotency: skip if we've already recorded this event. Guarded so a DB
  // issue (e.g. missing table before migrations) never turns into a 500.
  let existing: { status: WebhookEventStatus } | null = null
  try {
    existing = await prisma.webhookEvent.findUnique({ where: { eventId: event.id } })
  } catch (lookupErr) {
    logger.error('[STRIPE WEBHOOK] Dedup lookup failed (continuing)', {
      eventId: event.id,
      error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
    })
  }
  if (existing && existing.status === WebhookEventStatus.SUCCESS) {
    return NextResponse.json({ received: true, processed: true, duplicate: true })
  }

  let result: ProcessResult
  try {
    result = await processEvent(event)
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }

  const processingMs = Date.now() - startTime

  // Record the event (idempotency + audit / DLQ on failure).
  try {
    const data = {
      source: 'stripe',
      eventType: event.type,
      status: result.success ? WebhookEventStatus.SUCCESS : WebhookEventStatus.ERROR,
      errorMessage: result.error ?? null,
      processingMs,
      processedAt: result.success ? new Date() : null,
    }
    await prisma.webhookEvent.upsert({
      where: { eventId: event.id },
      update: { ...data, retryCount: { increment: existing ? 1 : 0 } },
      create: { ...data, eventId: event.id, payload: event as unknown as object },
    })
  } catch (logErr) {
    logger.error('[STRIPE WEBHOOK] Failed to record WebhookEvent', {
      eventId: event.id,
      error: logErr instanceof Error ? logErr.message : String(logErr),
    })
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
    })
  }

  // Always 200 once verified — failures are recorded, not retried into a storm.
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
      return {
        success: true,
        details: { paymentIntentId: pi.id, matched: res.matched, paymentStatus: res.paymentStatus },
      }
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const order = await prisma.order.findFirst({ where: { stripeChargeId: charge.id } })
      if (order) {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatus.REFUNDED },
        })
        // Free any stock reserved for this order (non-blocking).
        await releaseForOrder(order.id).catch(() => {})
      }
      return { success: true, details: { chargeId: charge.id, orderMatched: !!order } }
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
