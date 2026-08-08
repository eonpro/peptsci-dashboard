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
import { connectRequestOptions, getConnectedAccountId } from '@/lib/stripe/connect'
import { buildCostLookup, syncSalesRecordFromOrder } from '@/lib/sales'
import { salesRecordDataFromPaymentIntent } from '@/lib/stripe/sales-ingest'

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

/**
 * Parse a date filter into unix seconds. Date-only strings (`YYYY-MM-DD`) are
 * treated as UTC midnight for start, and UTC end-of-day for end, so a range
 * like Aug 1–Aug 8 includes all of Aug 8 rather than cutting off at 00:00.
 */
function toUnixSeconds(v: string | number | undefined, endOfDay = false): number | undefined {
  if (v === undefined) return undefined
  if (typeof v === 'number') return Math.floor(v)
  const raw = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const iso = endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`
    return Math.floor(Date.parse(iso) / 1000)
  }
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)
}

/**
 * POST /api/admin/sales/backfill-stripe
 *
 * Ingest historical succeeded PaymentIntents from the connected account into
 * SalesRecord. Body: { confirm: true, startDate?, endDate?, maxScan? }.
 *
 * Dedup + safety:
 *  - Upserts by `stripePaymentIntentId`, so re-runs are idempotent.
 *  - PIs already represented by a SalesRecord are skipped.
 *  - PIs linked to a CAPTURED platform Order sync from the order (real COGS)
 *    when no SalesRecord exists yet — previously we skipped these entirely,
 *    which left dashboard gaps when an Order was linked but never synced.
 *  - PIs linked to a non-captured Order (e.g. amount-mismatch) fall through
 *    to Stripe ingest so revenue still appears.
 *  - Skips test/synthetic PIs tagged `metadata.source = connect_test`.
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

    const gte = toUnixSeconds(parsed.data.startDate, false)
    const lte = toUnixSeconds(parsed.data.endDate, true)
    const maxScan = parsed.data.maxScan ?? 2000

    const summary = {
      connectedAccountId: getConnectedAccountId() ?? null,
      gte: gte ?? null,
      lte: lte ?? null,
      scanned: 0,
      created: 0,
      updated: 0,
      skippedOrder: 0,
      skippedExisting: 0,
      skippedTest: 0,
      skippedUnpaid: 0,
      syncedFromOrder: 0,
      failed: 0,
      failedSamples: [] as Array<{ paymentIntentId: string; error: string }>,
      sampleSucceeded: [] as Array<{ id: string; amount: number; created: string }>,
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

      const piIds = page.data.map((p) => p.id)

      const [existingSales, existingOrders] = await Promise.all([
        prisma.salesRecord.findMany({
          where: { stripePaymentIntentId: { in: piIds } },
          select: { stripePaymentIntentId: true },
        }),
        prisma.order.findMany({
          where: { stripePaymentIntentId: { in: piIds } },
          select: { id: true, stripePaymentIntentId: true, paymentStatus: true },
        }),
      ])

      const salePiSet = new Set(
        existingSales.map((s) => s.stripePaymentIntentId).filter(Boolean) as string[]
      )
      const orderByPi = new Map(
        existingOrders
          .filter((o) => o.stripePaymentIntentId)
          .map((o) => [o.stripePaymentIntentId as string, o])
      )

      for (const pi of page.data) {
        summary.scanned++
        try {
          if (pi.status !== 'succeeded') {
            summary.skippedUnpaid++
            continue
          }
          if (summary.sampleSucceeded.length < 10) {
            summary.sampleSucceeded.push({
              id: pi.id,
              amount: (pi.amount_received || pi.amount || 0) / 100,
              created: new Date(pi.created * 1000).toISOString(),
            })
          }
          if (pi.metadata?.source === 'connect_test') {
            summary.skippedTest++
            continue
          }

          // Already in analytics — nothing to do.
          if (salePiSet.has(pi.id)) {
            summary.skippedExisting++
            continue
          }

          const linkedOrder = orderByPi.get(pi.id)
          if (linkedOrder) {
            // Prefer order sync when captured (real line-item COGS). If that
            // still doesn't produce a SalesRecord, fall through to Stripe ingest.
            if (linkedOrder.paymentStatus === 'CAPTURED') {
              await syncSalesRecordFromOrder(linkedOrder.id)
              const after = await prisma.salesRecord.findFirst({
                where: {
                  OR: [{ orderId: linkedOrder.id }, { stripePaymentIntentId: pi.id }],
                },
                select: { id: true },
              })
              if (after) {
                summary.syncedFromOrder++
                salePiSet.add(pi.id)
                continue
              }
            }
            // Non-captured (amount mismatch / pending) or sync produced nothing:
            // do NOT skip — ingest so August revenue isn't stuck at $0.
            logger.warn('Stripe backfill: order-linked PI missing SalesRecord — ingesting', {
              paymentIntentId: pi.id,
              orderId: linkedOrder.id,
              paymentStatus: linkedOrder.paymentStatus,
            })
          }

          const data = await salesRecordDataFromPaymentIntent(stripe, pi, costLookup, requestOptions)

          const existing = await prisma.salesRecord.findUnique({
            where: { stripePaymentIntentId: pi.id },
            select: { id: true },
          })
          if (existing) {
            await prisma.salesRecord.update({ where: { id: existing.id }, data })
            summary.updated++
          } else {
            await prisma.salesRecord.create({
              data: { stripePaymentIntentId: pi.id, ...data },
            })
            summary.created++
          }
          salePiSet.add(pi.id)
        } catch (rowErr) {
          summary.failed++
          const error = rowErr instanceof Error ? rowErr.message : String(rowErr)
          if (summary.failedSamples.length < 10) {
            summary.failedSamples.push({ paymentIntentId: pi.id, error })
          }
          logger.warn('Stripe backfill row failed', {
            paymentIntentId: pi.id,
            error,
          })
        }
      }

      keepGoing = page.has_more
      startingAfter = page.data[page.data.length - 1]?.id
    }

    console.log('[STRIPE BACKFILL]', JSON.stringify({ by: userId, ...summary }))
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
