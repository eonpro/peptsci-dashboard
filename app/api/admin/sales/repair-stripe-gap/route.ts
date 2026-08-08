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
export const maxDuration = 300

const bodySchema = z.object({
  confirm: z.boolean().optional(),
  /** How many newest PaymentIntents to scan (default 150). */
  maxScan: z.number().int().positive().max(2000).optional(),
})

/**
 * POST /api/admin/sales/repair-stripe-gap
 *
 * Scans the newest succeeded PaymentIntents on the connected account and
 * forces any that are missing from SalesRecord into analytics. Unlike the
 * dated backfill, this always starts from "now" going backward (Stripe's
 * default list order), so a recent invoice payment can't be missed because
 * of a date-filter mistake.
 *
 * Body: { confirm: true, maxScan?: number }
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

    const maxScan = parsed.data.maxScan ?? 150
    const connectedAccountId = getConnectedAccountId() ?? null
    const requestOptions = connectRequestOptions()
    const costLookup = await buildCostLookup()

    const summary = {
      connectedAccountId,
      scanned: 0,
      succeededSeen: 0,
      alreadyPresent: 0,
      created: 0,
      updated: 0,
      syncedFromOrder: 0,
      failed: 0,
      ingestedSample: [] as Array<{
        paymentIntentId: string
        amount: number
        created: string
        customer: string
      }>,
      failedSamples: [] as Array<{ paymentIntentId: string; error: string }>,
      newestPiCreated: null as string | null,
    }

    let startingAfter: string | undefined
    let keepGoing = true

    while (keepGoing && summary.scanned < maxScan) {
      const page: Stripe.ApiList<Stripe.PaymentIntent> = await stripe.paymentIntents.list(
        {
          limit: Math.min(100, maxScan - summary.scanned),
          ...(startingAfter ? { starting_after: startingAfter } : {}),
          expand: ['data.latest_charge', 'data.customer'],
        },
        requestOptions
      )

      if (page.data.length === 0) break
      if (!summary.newestPiCreated && page.data[0]) {
        summary.newestPiCreated = new Date(page.data[0].created * 1000).toISOString()
      }

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
        if (pi.status !== 'succeeded') continue
        if (pi.metadata?.source === 'connect_test') continue
        summary.succeededSeen++

        if (salePiSet.has(pi.id)) {
          summary.alreadyPresent++
          continue
        }

        try {
          const linkedOrder = orderByPi.get(pi.id)
          if (linkedOrder?.paymentStatus === 'CAPTURED') {
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

          const data = await salesRecordDataFromPaymentIntent(
            stripe,
            pi,
            costLookup,
            requestOptions
          )

          // Prefer find+create/update over upsert: optional unique fields have
          // historically been flaky with Prisma upsert on some versions.
          const existing = await prisma.salesRecord.findUnique({
            where: { stripePaymentIntentId: pi.id },
            select: { id: true },
          })
          if (existing) {
            await prisma.salesRecord.update({
              where: { id: existing.id },
              data,
            })
            summary.updated++
          } else {
            await prisma.salesRecord.create({
              data: { stripePaymentIntentId: pi.id, ...data },
            })
            summary.created++
          }
          salePiSet.add(pi.id)

          if (summary.ingestedSample.length < 15) {
            summary.ingestedSample.push({
              paymentIntentId: pi.id,
              amount: data.paidAmount,
              created: new Date(pi.created * 1000).toISOString(),
              customer: data.customerEmail || data.customerName || '',
            })
          }
        } catch (rowErr) {
          summary.failed++
          const error = rowErr instanceof Error ? rowErr.message : String(rowErr)
          if (summary.failedSamples.length < 10) {
            summary.failedSamples.push({ paymentIntentId: pi.id, error })
          }
          logger.warn('Stripe gap repair row failed', { paymentIntentId: pi.id, error })
        }
      }

      keepGoing = page.has_more
      startingAfter = page.data[page.data.length - 1]?.id
    }

    // Force-visible in Vercel runtime logs (logger may only ship to Axiom).
    console.log('[STRIPE GAP REPAIR]', JSON.stringify({ by: userId, ...summary }))
    logger.info('Stripe gap repair completed', { by: userId, ...summary })

    return successResponse(summary)
  } catch (error) {
    console.error('[STRIPE GAP REPAIR] failed', error)
    logger.error(
      'Error repairing Stripe sales gap',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to repair Stripe sales gap'
    )
  }
}
