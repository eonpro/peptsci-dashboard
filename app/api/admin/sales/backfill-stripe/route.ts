import { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getStripeClient } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { buildCostLookup, estimateUnitCost } from '@/lib/sales'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Pages of 100 PIs, each upserted idempotently by stripePaymentIntentId; a
// re-run after a timeout is safe. Allow up to 5 minutes.
export const maxDuration = 300

const bodySchema = z.object({
  confirm: z.boolean().optional(),
  // Unix seconds or ISO date strings; both accepted.
  startDate: z.union([z.string(), z.number()]).optional(),
  endDate: z.union([z.string(), z.number()]).optional(),
  /** Safety cap on how many PaymentIntents to scan (default 2000). */
  maxScan: z.number().int().positive().max(20000).optional(),
})

function toUnixSeconds(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined
  if (typeof v === 'number') return Math.floor(v)
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)
}

function chargeFrom(pi: Stripe.PaymentIntent): Stripe.Charge | null {
  const latest = pi.latest_charge
  if (latest && typeof latest === 'object') return latest as Stripe.Charge
  return null
}

function customerFrom(pi: Stripe.PaymentIntent): Stripe.Customer | null {
  const c = pi.customer
  if (c && typeof c === 'object' && !('deleted' in c && c.deleted)) return c as Stripe.Customer
  return null
}

/**
 * Resolve the Invoice paid by a PaymentIntent (Stripe invoices/subscriptions).
 * Uses the InvoicePayments API (PaymentIntent.invoice no longer exists on
 * current API versions). Best-effort: returns null on any failure.
 */
async function invoiceForPaymentIntent(
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

interface LineSummary {
  product: string
  quantity: number
  cogs: number | null
}

/**
 * Summarize invoice lines into a product label, total unit quantity, and a
 * catalog-estimated COGS (null when no line matches the catalog).
 */
function summarizeInvoiceLines(
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
      if (unitCost !== perUnit * 0.35) {
        cogs += unitCost * qty
        matchedAny = true
      } else {
        cogs += unitCost * qty
      }
    }
  }

  const product =
    names.length === 0 ? '' : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} more`
  return { product, quantity, cogs: matchedAny ? cogs : null }
}

/**
 * POST /api/admin/sales/backfill-stripe
 *
 * Ingest historical succeeded PaymentIntents from the connected account into
 * SalesRecord. Body: { confirm: true, startDate?, endDate?, maxScan? }.
 *
 * Dedup + safety:
 *  - Upserts by `stripePaymentIntentId`, so re-runs are idempotent.
 *  - Skips PIs already represented by a platform Order (those are synced from
 *    the order itself with real COGS), preventing double counting.
 *  - Skips test/synthetic PIs tagged `metadata.source = connect_test`.
 *  - Product/vials are unknown from Stripe, so COGS uses the 35% fallback.
 * Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const stripe = getStripeClient()
    if (!stripe) return errorResponse('Stripe is not configured', 503, 'STRIPE_NOT_CONFIGURED')

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    if (parsed.data.confirm !== true) {
      return errorResponse('Confirmation required: POST { "confirm": true }', 400, 'CONFIRM_REQUIRED')
    }

    const gte = toUnixSeconds(parsed.data.startDate)
    const lte = toUnixSeconds(parsed.data.endDate)
    const maxScan = parsed.data.maxScan ?? 2000

    const summary = {
      scanned: 0,
      created: 0,
      updated: 0,
      skippedOrder: 0,
      skippedTest: 0,
      skippedUnpaid: 0,
      failed: 0,
    }

    const requestOptions = connectRequestOptions()
    const costLookup = await buildCostLookup()
    let startingAfter: string | undefined
    let keepGoing = true

    while (keepGoing && summary.scanned < maxScan) {
      const page: Stripe.ApiList<Stripe.PaymentIntent> = await stripe.paymentIntents.list(
        {
          limit: 100,
          ...(gte || lte ? { created: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
          ...(startingAfter ? { starting_after: startingAfter } : {}),
          expand: ['data.latest_charge', 'data.customer'],
        },
        requestOptions
      )

      if (page.data.length === 0) break

      // Batch-check which PIs already belong to a platform order.
      const piIds = page.data.map((p) => p.id)
      const existingOrders = await prisma.order.findMany({
        where: { stripePaymentIntentId: { in: piIds } },
        select: { stripePaymentIntentId: true },
      })
      const orderPiSet = new Set(
        existingOrders.map((o) => o.stripePaymentIntentId).filter(Boolean) as string[]
      )

      for (const pi of page.data) {
        summary.scanned++
        try {
          if (pi.status !== 'succeeded') {
            summary.skippedUnpaid++
            continue
          }
          if (pi.metadata?.source === 'connect_test') {
            summary.skippedTest++
            continue
          }
          if (orderPiSet.has(pi.id)) {
            summary.skippedOrder++
            continue
          }

          const charge = chargeFrom(pi)
          const billing = charge?.billing_details
          const customer = customerFrom(pi)
          const paidAmount = (pi.amount_received || pi.amount || 0) / 100

          // Pull the paying invoice (customer identity + line items) so the
          // dashboard shows WHO paid and WHAT they bought, not just a PI id.
          const invoice = await invoiceForPaymentIntent(stripe, pi.id, requestOptions)
          const lines = summarizeInvoiceLines(invoice, costLookup)

          const address = billing?.address || customer?.address || invoice?.customer_address
          const vials = lines.quantity
          // Catalog-matched COGS when the invoice lines identify products;
          // otherwise the 35%-of-revenue fallback.
          const cogs = lines.cogs ?? paidAmount * 0.35

          const data = {
            date: new Date(pi.created * 1000),
            orderRef: invoice?.number || pi.id,
            customerName:
              billing?.name ||
              customer?.name ||
              invoice?.customer_name ||
              pi.metadata?.customerName ||
              '',
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

          const res = await prisma.salesRecord.upsert({
            where: { stripePaymentIntentId: pi.id },
            create: { stripePaymentIntentId: pi.id, ...data },
            update: data,
          })
          // upsert can't tell us created vs updated directly; treat presence of
          // an equal createdAt/updatedAt as created.
          if (res.createdAt.getTime() === res.updatedAt.getTime()) summary.created++
          else summary.updated++
        } catch (rowErr) {
          summary.failed++
          logger.warn('Stripe backfill row failed', {
            paymentIntentId: pi.id,
            error: rowErr instanceof Error ? rowErr.message : String(rowErr),
          })
        }
      }

      keepGoing = page.has_more
      startingAfter = page.data[page.data.length - 1]?.id
    }

    logger.info('Stripe sales backfill completed', { by: userId, ...summary })
    return successResponse(summary)
  } catch (error) {
    logger.error(
      'Error backfilling sales from Stripe',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to backfill from Stripe')
  }
}
