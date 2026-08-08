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
import { nyMonthKey } from '@/lib/reports/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const bodySchema = z.object({
  confirm: z.boolean().optional(),
  /** How many newest PaymentIntents to scan (default 200). */
  maxScan: z.number().int().positive().max(2000).optional(),
})

/**
 * POST /api/admin/sales/repair-stripe-gap
 *
 * Scans newest succeeded PaymentIntents on the connected account and:
 *  1. Creates SalesRecords that are missing
 *  2. **Re-syncs date + amount** on records that already exist (fixes the
 *     "already in sales but August shows $0" failure mode where rows were
 *     stored with a null/wrong date)
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

    const maxScan = parsed.data.maxScan ?? 200
    const connectedAccountId = getConnectedAccountId() ?? null
    const requestOptions = connectRequestOptions()
    const costLookup = await buildCostLookup()
    const thisMonth = nyMonthKey(new Date())

    const summary = {
      connectedAccountId,
      scanned: 0,
      succeededSeen: 0,
      alreadyPresent: 0,
      created: 0,
      updated: 0,
      datesFixed: 0,
      syncedFromOrder: 0,
      failed: 0,
      ingestedSample: [] as Array<{
        paymentIntentId: string
        amount: number
        created: string
        customer: string
        action: string
      }>,
      failedSamples: [] as Array<{ paymentIntentId: string; error: string }>,
      newestPiCreated: null as string | null,
      augustBefore: { count: 0, sum: 0 },
      augustAfter: { count: 0, sum: 0 },
      sampleExisting: [] as Array<{
        paymentIntentId: string
        dbDate: string | null
        dbAmount: number
        piCreated: string
        piAmount: number
      }>,
    }

    // Snapshot August revenue before repair so the dialog proves the fix.
    const allForAugCheck = await prisma.salesRecord.findMany({
      where: { date: { not: null } },
      select: { date: true, paidAmount: true },
    })
    let augCount = 0
    let augSum = 0
    for (const r of allForAugCheck) {
      if (r.date && nyMonthKey(r.date) === thisMonth) {
        augCount++
        augSum += Number(r.paidAmount)
      }
    }
    summary.augustBefore = { count: augCount, sum: augSum }

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
          select: {
            id: true,
            stripePaymentIntentId: true,
            date: true,
            paidAmount: true,
          },
        }),
        prisma.order.findMany({
          where: { stripePaymentIntentId: { in: piIds } },
          select: { id: true, stripePaymentIntentId: true, paymentStatus: true },
        }),
      ])
      const saleByPi = new Map(
        existingSales
          .filter((s) => s.stripePaymentIntentId)
          .map((s) => [s.stripePaymentIntentId as string, s])
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

        const existing = saleByPi.get(pi.id)
        const piAmount = (pi.amount_received || pi.amount || 0) / 100
        const piCreated = new Date(pi.created * 1000)

        if (existing && summary.sampleExisting.length < 8) {
          summary.sampleExisting.push({
            paymentIntentId: pi.id,
            dbDate: existing.date ? existing.date.toISOString() : null,
            dbAmount: Number(existing.paidAmount),
            piCreated: piCreated.toISOString(),
            piAmount,
          })
        }

        try {
          const linkedOrder = orderByPi.get(pi.id)
          if (!existing && linkedOrder?.paymentStatus === 'CAPTURED') {
            await syncSalesRecordFromOrder(linkedOrder.id)
            const after = await prisma.salesRecord.findFirst({
              where: {
                OR: [{ orderId: linkedOrder.id }, { stripePaymentIntentId: pi.id }],
              },
              select: { id: true, date: true, paidAmount: true, stripePaymentIntentId: true },
            })
            if (after) {
              summary.syncedFromOrder++
              saleByPi.set(pi.id, {
                id: after.id,
                stripePaymentIntentId: after.stripePaymentIntentId,
                date: after.date,
                paidAmount: after.paidAmount,
              })
              continue
            }
          }

          const data = await salesRecordDataFromPaymentIntent(
            stripe,
            pi,
            costLookup,
            requestOptions
          )

          if (existing) {
            const dateWasWrong =
              !existing.date ||
              Math.abs(existing.date.getTime() - piCreated.getTime()) > 60_000 ||
              Number(existing.paidAmount) !== data.paidAmount

            await prisma.salesRecord.update({
              where: { id: existing.id },
              data,
            })
            summary.updated++
            if (dateWasWrong) summary.datesFixed++

            if (dateWasWrong && summary.ingestedSample.length < 15) {
              summary.ingestedSample.push({
                paymentIntentId: pi.id,
                amount: data.paidAmount,
                created: piCreated.toISOString(),
                customer: data.customerEmail || data.customerName || '',
                action: 'date/amount fixed',
              })
            }
          } else {
            await prisma.salesRecord.create({
              data: { stripePaymentIntentId: pi.id, ...data },
            })
            summary.created++
            if (summary.ingestedSample.length < 15) {
              summary.ingestedSample.push({
                paymentIntentId: pi.id,
                amount: data.paidAmount,
                created: piCreated.toISOString(),
                customer: data.customerEmail || data.customerName || '',
                action: 'created',
              })
            }
          }
          summary.alreadyPresent += existing ? 1 : 0
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

    // August after
    const afterRows = await prisma.salesRecord.findMany({
      where: { date: { not: null } },
      select: { date: true, paidAmount: true },
    })
    let augCountAfter = 0
    let augSumAfter = 0
    for (const r of afterRows) {
      if (r.date && nyMonthKey(r.date) === thisMonth) {
        augCountAfter++
        augSumAfter += Number(r.paidAmount)
      }
    }
    summary.augustAfter = { count: augCountAfter, sum: augSumAfter }

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
