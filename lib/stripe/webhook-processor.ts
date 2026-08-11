/**
 * Stripe event processing shared by the webhook endpoint and the admin DLQ
 * retry route. Pure business logic — signature verification, idempotency
 * claims, and HTTP semantics stay in the callers.
 */

import type Stripe from 'stripe'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getStripeClient } from '@/lib/stripe/config'
import {
  reconcileOrderFromPaymentIntent,
  persistPaymentMethodFromStripe,
} from '@/lib/stripe/payments'
import { ingestStripePaymentIntent } from '@/lib/stripe/sales-ingest'
import { recordPayment } from '@/lib/invoicing/service'
import { reconcileRetailOrderFromPaymentIntent } from '@/lib/storefront-payments'
import { syncConnectAccountStatus } from '@/lib/partners/stripe-payouts'
import { applyStripeChargeRefund } from '@/lib/orders/apply-stripe-refund'

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

async function ingestExternalSale(
  piId: string,
  account: string | undefined
): Promise<boolean> {
  const stripeClient = getStripeClient()
  if (!stripeClient) return false
  return ingestStripePaymentIntent(
    stripeClient,
    piId,
    account ? { stripeAccount: account } : undefined
  )
}

/**
 * Guarantee a SalesRecord for a succeeded external PaymentIntent.
 * Returns 'exists' | 'ingested' | 'failed'.
 */
async function ensureSalesRecordForExternalPi(
  piId: string,
  account: string | undefined
): Promise<'exists' | 'ingested' | 'failed'> {
  if (!prisma) return 'failed'
  const existing = await prisma.salesRecord.findUnique({
    where: { stripePaymentIntentId: piId },
    select: { id: true },
  })
  if (existing) return 'exists'
  const ingested = await ingestExternalSale(piId, account)
  return ingested ? 'ingested' : 'failed'
}

export async function processStripeEvent(event: Stripe.Event): Promise<ProcessResult> {
  if (!prisma) return { success: false, error: 'DB unavailable' }

  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled':
    case 'payment_intent.processing': {
      const pi = event.data.object as Stripe.PaymentIntent

      // Retail storefront payments carry metadata.retailOrderId (no orderId).
      // Reconcile the RetailOrder directly — they must not fall through to the
      // external-sale ingest (retail revenue is the clinic's, not PeptSci's
      // B2B sales analytics).
      if (!pi.metadata?.orderId && pi.metadata?.retailOrderId) {
        const retail = await reconcileRetailOrderFromPaymentIntent(pi)
        if (!retail.matched) {
          return {
            success: false,
            retryable: true,
            error: `No retail order matched for PaymentIntent ${pi.id}`,
            details: { paymentIntentId: pi.id, retailOrderId: pi.metadata.retailOrderId },
          }
        }
        return {
          success: true,
          details: {
            paymentIntentId: pi.id,
            retailOrderId: pi.metadata.retailOrderId,
            paymentStatus: retail.paymentStatus,
          },
        }
      }

      // Client invoice payments (portal "pay invoice") carry metadata.invoiceId
      // pointing at a *platform* Invoice row. Only intercept when that row
      // exists — Stripe-hosted invoices sometimes put an unrelated `invoiceId`
      // in metadata, and treating those as platform payments would acknowledge
      // SUCCESS without ever writing a SalesRecord (August revenue stays $0).
      if (!pi.metadata?.orderId && pi.metadata?.invoiceId) {
        const platformInvoice = await prisma.invoice.findUnique({
          where: { id: pi.metadata.invoiceId },
          select: { id: true },
        })
        if (platformInvoice) {
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
            return {
              success: true,
              details: { paymentIntentId: pi.id, invoiceId: pi.metadata.invoiceId },
            }
          } catch (err) {
            return {
              success: false,
              retryable: true,
              error: `Failed to record invoice payment: ${err instanceof Error ? err.message : String(err)}`,
              details: { paymentIntentId: pi.id, invoiceId: pi.metadata.invoiceId },
            }
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
          const ingested = await ingestExternalSale(pi.id, event.account)
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

      // Safety net: a succeeded PaymentIntent must leave a SalesRecord unless
      // it was a retail payment or a platform invoice payment (AR path).
      // Covers amount-mismatch order matches and any SUCCESS-without-analytics
      // path (the Aug 2026 $0-MTD failure mode).
      if (pi.status === 'succeeded' && !pi.metadata?.retailOrderId) {
        const platformInvoiceId = pi.metadata?.invoiceId
        const isPlatformInvoice = platformInvoiceId
          ? !!(await prisma.invoice.findUnique({
              where: { id: platformInvoiceId },
              select: { id: true },
            }))
          : false
        if (!isPlatformInvoice) {
          const ensured = await ensureSalesRecordForExternalPi(pi.id, event.account)
          if (ensured === 'failed') {
            return {
              success: false,
              retryable: true,
              error: `PaymentIntent ${pi.id} succeeded but SalesRecord ingest failed`,
              details: { paymentIntentId: pi.id, matched: res.matched, ensuredSale: false },
            }
          }
          return {
            success: true,
            details: {
              paymentIntentId: pi.id,
              matched: res.matched,
              paymentStatus: res.paymentStatus,
              ensuredSale: ensured === 'ingested',
            },
          }
        }
      }

      return {
        success: true,
        details: { paymentIntentId: pi.id, matched: res.matched, paymentStatus: res.paymentStatus },
      }
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      // Sync refundedTotal / REFUNDED, reverse commission, and cancel pre-ship
      // fulfillment when Stripe Dashboard issues a full refund (incl. white-
      // label invoice charges that never set Order.stripeChargeId).
      const applied = await applyStripeChargeRefund(charge)

      // External payment (no platform order): re-ingest the PaymentIntent so
      // its SalesRecord nets out the refund (paidAmount/COGS recomputed from
      // Stripe's current state — idempotent across retries/partial refunds).
      const piId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id
      if (!applied.orderMatched && piId) {
        const salesAdjusted = await ingestExternalSale(piId, event.account)
        if (!salesAdjusted) {
          return {
            success: false,
            retryable: true,
            error: `Failed to apply refund to sales record for PaymentIntent ${piId}`,
            details: { chargeId: charge.id, amountRefunded: charge.amount_refunded },
          }
        }
        return {
          success: true,
          details: {
            chargeId: charge.id,
            orderMatched: false,
            fullyRefunded: applied.fullyRefunded,
            salesAdjusted: true,
            amountRefunded: charge.amount_refunded,
          },
        }
      }

      return {
        success: true,
        details: {
          chargeId: charge.id,
          orderMatched: applied.orderMatched,
          orderId: applied.orderId ?? null,
          fullyRefunded: applied.fullyRefunded,
          cancelled: applied.cancelled,
          cancelSkippedReason: applied.cancelSkippedReason ?? null,
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

    case 'account.updated': {
      // Partner Express accounts (automated payouts): mirror payouts_enabled
      // onto the org row. Accounts we don't know are a no-op.
      const account = event.data.object as Stripe.Account
      const matched = await syncConnectAccountStatus(account)
      return { success: true, details: { accountId: account.id, matched } }
    }

    default:
      return { success: true, details: { skipped: true, reason: 'Unhandled event type' } }
  }
}
