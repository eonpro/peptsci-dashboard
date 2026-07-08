/**
 * Stripe → SalesRecord ingestion (shared by the historical backfill and the
 * live webhook).
 *
 * Given a succeeded PaymentIntent on the connected account, builds an enriched
 * analytics row: customer identity from billing details / the Stripe Customer /
 * the paying Invoice, invoice number as the order ref, product + quantities
 * from invoice lines, and catalog-matched COGS (35%-of-revenue fallback).
 * Upserts by `stripePaymentIntentId`, so re-ingestion is idempotent.
 */

import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { buildCostLookup, estimateUnitCost } from '@/lib/sales'

export function chargeFrom(pi: Stripe.PaymentIntent): Stripe.Charge | null {
  const latest = pi.latest_charge
  if (latest && typeof latest === 'object') return latest as Stripe.Charge
  return null
}

export function customerFrom(pi: Stripe.PaymentIntent): Stripe.Customer | null {
  const c = pi.customer
  if (c && typeof c === 'object' && !('deleted' in c && c.deleted)) return c as Stripe.Customer
  return null
}

/**
 * Resolve the Invoice paid by a PaymentIntent (Stripe invoices/subscriptions).
 * Uses the InvoicePayments API (PaymentIntent.invoice no longer exists on
 * current API versions). Best-effort: returns null on any failure.
 */
export async function invoiceForPaymentIntent(
  stripe: Stripe,
  piId: string,
  requestOptions: Stripe.RequestOptions | undefined
): Promise<Stripe.Invoice | null> {
  try {
    const payments = await stripe.invoicePayments.list(
      {
        payment: { type: 'payment_intent', payment_intent: piId },
        limit: 1,
        expand: ['data.invoice'],
      },
      requestOptions
    )
    const inv = payments.data[0]?.invoice
    if (inv && typeof inv === 'object' && !('deleted' in inv && inv.deleted)) {
      return inv as Stripe.Invoice
    }
    return null
  } catch {
    return null
  }
}

export interface LineSummary {
  product: string
  quantity: number
  cogs: number | null
}

/**
 * Summarize invoice lines into a product label, total unit quantity, and a
 * catalog-estimated COGS (null when no line matches the catalog).
 */
export function summarizeInvoiceLines(
  invoice: Stripe.Invoice | null,
  costLookup: Map<string, number>
): LineSummary {
  const lines = invoice?.lines?.data ?? []
  if (lines.length === 0) return { product: '', quantity: 0, cogs: null }

  let quantity = 0
  let cogs = 0
  let matchedAny = false
  const names: string[] = []

  for (const line of lines) {
    const qty = line.quantity ?? 1
    const desc = (line.description || '').trim()
    if (desc) names.push(desc)
    quantity += qty
    if (desc) {
      const perUnit = (line.amount ?? 0) / 100 / (qty || 1)
      const unitCost = estimateUnitCost(desc, perUnit, costLookup)
      // estimateUnitCost falls back to 35% of price; only trust real matches.
      if (unitCost !== perUnit * 0.35) matchedAny = true
      cogs += unitCost * qty
    }
  }

  const product =
    names.length === 0 ? '' : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} more`
  return { product, quantity, cogs: matchedAny ? cogs : null }
}

/** Build the SalesRecord data payload for a succeeded PaymentIntent. */
export async function salesRecordDataFromPaymentIntent(
  stripe: Stripe,
  pi: Stripe.PaymentIntent,
  costLookup: Map<string, number>,
  requestOptions: Stripe.RequestOptions | undefined
) {
  const charge = chargeFrom(pi)
  const billing = charge?.billing_details
  const customer = customerFrom(pi)
  const paidAmount = (pi.amount_received || pi.amount || 0) / 100

  // Pull the paying invoice (customer identity + line items) so the dashboard
  // shows WHO paid and WHAT they bought, not just a PI id.
  const invoice = await invoiceForPaymentIntent(stripe, pi.id, requestOptions)
  const lines = summarizeInvoiceLines(invoice, costLookup)

  const address = billing?.address || customer?.address || invoice?.customer_address
  const vials = lines.quantity
  const cogs = lines.cogs ?? paidAmount * 0.35

  return {
    date: new Date(pi.created * 1000),
    orderRef: invoice?.number || pi.id,
    customerName:
      billing?.name || customer?.name || invoice?.customer_name || pi.metadata?.customerName || '',
    customerEmail:
      billing?.email ||
      customer?.email ||
      invoice?.customer_email ||
      charge?.receipt_email ||
      pi.metadata?.customerEmail ||
      '',
    customerPhone: billing?.phone || customer?.phone || invoice?.customer_phone || '',
    address: address?.line1 || '',
    city: address?.city || '',
    state: address?.state || '',
    zip: address?.postal_code || '',
    trackingNumber: '',
    invoicePaid: true,
    paidAmount,
    vials,
    amountPerVial: vials > 0 ? paidAmount / vials : 0,
    product: lines.product || pi.description || '',
    notes: invoice?.number
      ? `Imported from Stripe (invoice ${invoice.number})`
      : 'Imported from Stripe',
    unitCost: vials > 0 ? cogs / vials : 0,
    cogs,
    source: 'stripe',
  }
}

/**
 * Ingest a single succeeded PaymentIntent into SalesRecord (live webhook path).
 * Re-retrieves the PI with the expansions the enrichment needs (webhook
 * payloads carry bare ids). Returns true when a record was written.
 */
export async function ingestStripePaymentIntent(
  stripe: Stripe,
  piId: string,
  requestOptions: Stripe.RequestOptions | undefined
): Promise<boolean> {
  if (!prisma) return false
  try {
    const pi = await stripe.paymentIntents.retrieve(
      piId,
      { expand: ['latest_charge', 'customer'] },
      requestOptions
    )
    if (pi.status !== 'succeeded') return false
    if (pi.metadata?.source === 'connect_test') return false

    const costLookup = await buildCostLookup()
    const data = await salesRecordDataFromPaymentIntent(stripe, pi, costLookup, requestOptions)

    await prisma.salesRecord.upsert({
      where: { stripePaymentIntentId: pi.id },
      create: { stripePaymentIntentId: pi.id, ...data },
      update: data,
    })
    logger.info('[STRIPE] SalesRecord ingested from webhook', {
      paymentIntentId: pi.id,
      amount: data.paidAmount,
      customer: data.customerName || data.customerEmail || 'unknown',
    })
    return true
  } catch (error) {
    logger.error('[STRIPE] Failed to ingest PaymentIntent into SalesRecord', {
      paymentIntentId: piId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
