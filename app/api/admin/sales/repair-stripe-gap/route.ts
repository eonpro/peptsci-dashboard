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
})

function augustStartUnix(): number {
  // First instant of this America/New_York calendar month, as unix seconds.
  const month = nyMonthKey(new Date()) // YYYY-MM
  // 00:00 ET on the 1st ≈ 04:00/05:00 UTC — use the 1st 00:00 UTC minus 1 day
  // as a safe lower bound, then filter precisely with nyMonthKey when counting.
  const [y, m] = month.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, 1, 0, 0, 0) / 1000) - 48 * 3600
}

/**
 * POST /api/admin/sales/repair-stripe-gap
 *
 * Specifically targets THIS calendar month's PaymentIntents on the connected
 * account (created >= month start), because a "newest 200" scan can sit entirely
 * on unpaid/failed recent PIs and never reach the Aug 4 succeeded charge.
 *
 * Body: { confirm: true }
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

    const connectedAccountId = getConnectedAccountId() ?? null
    const requestOptions = connectRequestOptions()
    const costLookup = await buildCostLookup()
    const thisMonth = nyMonthKey(new Date())
    const gte = augustStartUnix()

    const summary = {
      connectedAccountId,
      thisMonth,
      createdGte: new Date(gte * 1000).toISOString(),
      scanned: 0,
      succeededSeen: 0,
      succeededThisMonth: 0,
      created: 0,
      updated: 0,
      datesFixed: 0,
      syncedFromOrder: 0,
      failed: 0,
      augustBefore: { count: 0, sum: 0 },
      augustAfter: { count: 0, sum: 0 },
      monthPiSample: [] as Array<{
        paymentIntentId: string
        status: string
        amount: number
        created: string
        hasSalesRecord: boolean
        dbDate: string | null
        dbAmount: number | null
        action: string
      }>,
      failedSamples: [] as Array<{ paymentIntentId: string; error: string }>,
    }

    // August snapshot before
    {
      const rows = await prisma.salesRecord.findMany({
        where: { date: { not: null } },
        select: { date: true, paidAmount: true },
      })
      let count = 0
      let sum = 0
      for (const r of rows) {
        if (r.date && nyMonthKey(r.date) === thisMonth) {
          count++
          sum += Number(r.paidAmount)
        }
      }
      summary.augustBefore = { count, sum }
    }

    let startingAfter: string | undefined
    let keepGoing = true
    const MAX = 2000

    while (keepGoing && summary.scanned < MAX) {
      const page: Stripe.ApiList<Stripe.PaymentIntent> = await stripe.paymentIntents.list(
        {
          limit: 100,
          created: { gte },
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
        const piCreated = new Date(pi.created * 1000)
        const inThisMonth = nyMonthKey(piCreated) === thisMonth
        const piAmount = (pi.amount_received || pi.amount || 0) / 100
        const existing = saleByPi.get(pi.id)

        if (pi.status === 'succeeded') summary.succeededSeen++
        if (pi.status === 'succeeded' && inThisMonth) summary.succeededThisMonth++

        // Always record this-month PIs in the sample (succeeded or not) so we
        // can see why a Dashboard "Succeeded" charge might be missing.
        if (inThisMonth && summary.monthPiSample.length < 40) {
          summary.monthPiSample.push({
            paymentIntentId: pi.id,
            status: pi.status,
            amount: piAmount,
            created: piCreated.toISOString(),
            hasSalesRecord: !!existing,
            dbDate: existing?.date ? existing.date.toISOString() : null,
            dbAmount: existing ? Number(existing.paidAmount) : null,
            action: 'pending',
          })
        }

        if (pi.status !== 'succeeded') continue
        if (pi.metadata?.source === 'connect_test') continue

        try {
          const linkedOrder = orderByPi.get(pi.id)
          if (!existing && linkedOrder?.paymentStatus === 'CAPTURED') {
            await syncSalesRecordFromOrder(linkedOrder.id)
            const after = await prisma.salesRecord.findFirst({
              where: {
                OR: [{ orderId: linkedOrder.id }, { stripePaymentIntentId: pi.id }],
              },
              select: { id: true },
            })
            if (after) {
              summary.syncedFromOrder++
              const sample = summary.monthPiSample.find((s) => s.paymentIntentId === pi.id)
              if (sample) sample.action = 'synced from order'
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
            const sample = summary.monthPiSample.find((s) => s.paymentIntentId === pi.id)
            if (sample) sample.action = dateWasWrong ? 'date/amount fixed' : 'refreshed'
          } else {
            await prisma.salesRecord.create({
              data: { stripePaymentIntentId: pi.id, ...data },
            })
            summary.created++
            const sample = summary.monthPiSample.find((s) => s.paymentIntentId === pi.id)
            if (sample) sample.action = 'created'
          }
        } catch (rowErr) {
          summary.failed++
          const error = rowErr instanceof Error ? rowErr.message : String(rowErr)
          if (summary.failedSamples.length < 10) {
            summary.failedSamples.push({ paymentIntentId: pi.id, error })
          }
          const sample = summary.monthPiSample.find((s) => s.paymentIntentId === pi.id)
          if (sample) sample.action = `failed: ${error.slice(0, 80)}`
          logger.warn('Stripe gap repair row failed', { paymentIntentId: pi.id, error })
        }
      }

      keepGoing = page.has_more
      startingAfter = page.data[page.data.length - 1]?.id
    }

    // August after
    {
      const rows = await prisma.salesRecord.findMany({
        where: { date: { not: null } },
        select: { date: true, paidAmount: true },
      })
      let count = 0
      let sum = 0
      for (const r of rows) {
        if (r.date && nyMonthKey(r.date) === thisMonth) {
          count++
          sum += Number(r.paidAmount)
        }
      }
      summary.augustAfter = { count, sum }
    }

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
