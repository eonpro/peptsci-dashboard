/**
 * Stripe Webhook Handler (adapted from EonPro's bulletproof pattern).
 *
 * Rules:
 * 1. Never return 500 for business-logic failures (avoids retry storms) —
 *    those are recorded in WebhookEvent for manual review and acknowledged
 *    with 200. TRANSIENT failures (DB unavailable, order not linked yet)
 *    return 503 so Stripe retries within its window.
 * 2. Verify the signature before any processing.
 * 3. Idempotent on Stripe event id via the WebhookEvent table.
 * 4. Reconcile orders/payment methods from the event payload.
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import type Stripe from 'stripe'
import { WebhookEventStatus } from '@prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getStripeClient, getStripeWebhookSecret } from '@/lib/stripe/config'
import { getConnectedAccountId } from '@/lib/stripe/connect'
import { processStripeEvent, type ProcessResult } from '@/lib/stripe/webhook-processor'

export const dynamic = 'force-dynamic'

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
  // Partner Express accounts (automated payouts) emit account.updated with
  // THEIR account id — those must pass the scoping gate. The processor looks
  // the account up by PartnerOrg.stripeConnectAccountId; unknown accounts
  // no-op, so letting this event type through is safe.
  const isPartnerAccountEvent = event.type === 'account.updated'
  if (monitoredAccount) {
    if (event.account !== monitoredAccount && !isPartnerAccountEvent) {
      return NextResponse.json({ received: true, skipped: 'account_not_monitored' })
    }
  } else if (process.env.NODE_ENV === 'production' && !isPartnerAccountEvent) {
    logger.error('[STRIPE WEBHOOK] No connected account configured in production; skipping', {
      eventId: event.id,
      eventAccount: event.account,
    })
    return NextResponse.json({ received: true, processed: false, reason: 'no_monitored_account' })
  }

  if (!prisma) {
    // Can't dedupe/record without a DB. Return 503 so Stripe retries — a
    // transient DB outage must not silently drop payment events (orders would
    // stay PENDING forever). Stripe backs off and retries for up to 3 days.
    logger.error('[STRIPE WEBHOOK] DB unavailable; asking Stripe to retry', { eventId: event.id })
    return NextResponse.json(
      { received: true, processed: false, retry: true, reason: 'db_unavailable' },
      { status: 503 }
    )
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
      // DB error (connection drop, table missing). Return 503 so Stripe
      // retries rather than silently dropping the event. If the failure is
      // persistent (e.g. missing table), retries exhaust in Stripe's window
      // and the event surfaces in the Stripe dashboard as failed delivery.
      logger.error('[STRIPE WEBHOOK] Claim insert failed; asking Stripe to retry', {
        eventId: event.id,
        error: createErr instanceof Error ? createErr.message : String(createErr),
      })
      return NextResponse.json(
        { received: true, processed: false, retry: true, reason: 'claim_failed' },
        { status: 503 }
      )
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
    result = await processStripeEvent(event)
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

