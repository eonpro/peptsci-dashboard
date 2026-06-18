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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    let startingAfter: string | undefined
    let keepGoing = true

    while (keepGoing && summary.scanned < maxScan) {
      const page: Stripe.ApiList<Stripe.PaymentIntent> = await stripe.paymentIntents.list(
        {
          limit: 100,
          ...(gte || lte ? { created: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
          ...(startingAfter ? { starting_after: startingAfter } : {}),
          expand: ['data.latest_charge'],
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
          const paidAmount = (pi.amount_received || pi.amount || 0) / 100
          const cogs = paidAmount * 0.35

          const data = {
            date: new Date(pi.created * 1000),
            orderRef: pi.id,
            customerName: billing?.name || pi.metadata?.customerName || '',
            customerEmail:
              billing?.email || charge?.receipt_email || pi.metadata?.customerEmail || '',
            customerPhone: billing?.phone || '',
            address: billing?.address?.line1 || '',
            city: billing?.address?.city || '',
            state: billing?.address?.state || '',
            zip: billing?.address?.postal_code || '',
            trackingNumber: '',
            invoicePaid: true,
            paidAmount,
            vials: 0,
            amountPerVial: 0,
            product: pi.description || '',
            notes: 'Imported from Stripe',
            unitCost: 0,
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
