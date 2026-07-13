/**
 * Stripe event processing shared by the webhook endpoint and the admin DLQ
 * retry route. Pure business logic — signature verification, idempotency
 * claims, and HTTP semantics stay in the callers.
 */

import type Stripe from 'stripe'
import { PaymentStatus } from '@prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getStripeClient } from '@/lib/stripe/config'
import {
  reconcileOrderFromPaymentIntent,
  persistPaymentMethodFromStripe,
} from '@/lib/stripe/payments'
import { ingestStripePaymentIntent } from '@/lib/stripe/sales-ingest'
import { releaseForOrder } from '@/lib/inventory/reservations'
import { recordPayment } from '@/lib/invoicing/service'
import { syncSalesRecordFromOrder } from '@/lib/sales'

export interface ProcessResult {
  success: boolean
  error?: string
  details?: Record<string, unknown>
  /**
   * When true, a failure is considered transient (e.g. the order isn't linked
   * yet) and the webhook returns a 5xx so Stripe retries. When false/absent,
   * failures are recorded but acknowledged with a 200 (no retry storm).
   */
  retryable?: boolean
}

export async function processStripeEvent(event: Stripe.Event): Promise<ProcessResult> {
  if (!prisma) return { success: false, error: 'DB unavailable' }

  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled':
    case 'payment_intent.processing': {
      const pi = event.data.object as Stripe.PaymentIntent

      // Client invoice payments (portal "pay invoice") carry metadata.invoiceId
      // and no orderId. Record them against the invoice (idempotent on PI id)
      // instead of falling through to order reconcile / external-sale ingest,
      // which would double-count the revenue.
      if (!pi.metadata?.orderId && pi.metadata?.invoiceId) {
        if (pi.status !== 'succeeded') {
          return {
            success: true,
            details: { paymentIntentId: pi.id, skipped: 'invoice_pi_not_succeeded' },
          }
        }
        try {
          await recordPayment(pi.metadata.invoiceId, {
            amount: (pi.amount_received || pi.amount) / 100,
            method: 'stripe',
            stripePaymentIntentId: pi.id,
            notes: 'Paid online via client portal',
          })
          return { success: true, details: { paymentIntentId: pi.id, invoiceId: pi.metadata.invoiceId } }
        } catch (err) {
          return {
            success: false,
            retryable: true,
            error: `Failed to record invoice payment: ${err instanceof Error ? err.message : String(err)}`,
            details: { paymentIntentId: pi.id, invoiceId: pi.metadata.invoiceId },
          }
        }
      }

      const res = await reconcileOrderFromPaymentIntent(pi)

      if (!res.matched && (pi.status === 'succeeded' || pi.status === 'processing')) {
        // Platform-created PIs always carry metadata.orderId. Without it, this
        // is a payment made OUTSIDE the platform (Stripe-hosted invoice,
        // subscription, or dashboard charge) — ingest it into sales analytics
        // immediately so the dashboard updates in real time.
        const isPlatformPi = !!pi.metadata?.orderId
        if (!isPlatformPi) {
          if (pi.status !== 'succeeded') {
            // ACH/processing invoice payments: wait for the succeeded event.
            return {
              success: true,
              details: { paymentIntentId: pi.id, skipped: 'external_pi_processing' },
            }
          }
          const stripeClient = getStripeClient()
          const ingested = stripeClient
            ? await ingestStripePaymentIntent(
                stripeClient,
                pi.id,
                event.account ? { stripeAccount: event.account } : undefined
              )
            : false
          if (ingested) {
            return {
              success: true,
              details: { paymentIntentId: pi.id, ingestedAsSale: true },
            }
          }
          return {
            success: false,
            retryable: true,
            error: `Failed to ingest external PaymentIntent ${pi.id} into sales`,
            details: { paymentIntentId: pi.id, matched: false },
          }
        }
        // A platform payment with no matching order is a real problem (bad
        // metadata, order not linked yet, or deleted order). Fail as retryable
        // so Stripe retries — a later delivery can match once the link is
        // written; persistent failures land in the WebhookEvent DLQ.
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
      if (order) {
        // Track cumulative refunds from Stripe's authoritative charge state so
        // dashboard-issued refunds stay in sync with our /refund endpoint, and
        // re-sync the SalesRecord so revenue nets out the refund. Idempotent.
        await prisma.order.update({
          where: { id: order.id },
          data: {
            refundedTotal: charge.amount_refunded / 100,
            refundedAt: new Date(),
            ...(fullyRefunded ? { paymentStatus: PaymentStatus.REFUNDED } : {}),
          },
        })
        await syncSalesRecordFromOrder(order.id)
      }
      if (order && fullyRefunded) {
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

      // External payment (no platform order): re-ingest the PaymentIntent so
      // its SalesRecord nets out the refund (paidAmount/COGS recomputed from
      // Stripe's current state — idempotent across retries/partial refunds).
      let salesAdjusted = false
      const piId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id
      if (!order && piId) {
        const stripeClient = getStripeClient()
        if (stripeClient) {
          salesAdjusted = await ingestStripePaymentIntent(
            stripeClient,
            piId,
            event.account ? { stripeAccount: event.account } : undefined
          )
        }
        if (!salesAdjusted) {
          return {
            success: false,
            retryable: true,
            error: `Failed to apply refund to sales record for PaymentIntent ${piId}`,
            details: { chargeId: charge.id, amountRefunded: charge.amount_refunded },
          }
        }
      }

      return {
        success: true,
        details: {
          chargeId: charge.id,
          orderMatched: !!order,
          fullyRefunded,
          salesAdjusted,
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
