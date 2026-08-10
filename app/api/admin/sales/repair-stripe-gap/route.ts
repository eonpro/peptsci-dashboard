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
import {
  salesRecordDataFromPaymentIntent,
  shouldSkipSalesIngestForPlatformInvoice,
} from '@/lib/stripe/sales-ingest'
import { nyMonthKey } from '@/lib/reports/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const bodySchema = z.object({
  confirm: z.boolean().optional(),
})

function monthStartUnix(): number {
  // First instant of this America/New_York calendar month, as unix seconds.
  const month = nyMonthKey(new Date()) // YYYY-MM
  // 00:00 ET on the 1st ≈ 04:00/05:00 UTC — use the 1st 00:00 UTC minus 1 day
  // as a safe lower bound, then filter precisely with nyMonthKey when counting.
  const [y, m] = month.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, 1, 0, 0, 0) / 1000) - 48 * 3600
}

function piIdFromCharge(charge: Stripe.Charge): string | null {
  const pi = charge.payment_intent
  if (!pi) return null
  return typeof pi === 'string' ? pi : pi.id
}

/**
 * POST /api/admin/sales/repair-stripe-gap
 *
 * Scans Charges by paid time (charge.created >= month start) on the connected
 * account. Invoice PaymentIntents are often created weeks before capture, so
 * filtering on pi.created misses August money that still has a July PI.
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
    const gte = monthStartUnix()

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
      skippedPlatformInvoice: 0,
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
    const seenPi = new Set<string>()

    while (keepGoing && summary.scanned < MAX) {
      // Charges.created ≈ when money moved (invoice PIs can be much older).
      const page: Stripe.ApiList<Stripe.Charge> = await stripe.charges.list(
        {
          limit: 100,
          created: { gte },
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
        requestOptions
      )

      if (page.data.length === 0) break

      const chargeRows = page.data.map((ch) => ({
        charge: ch,
        piId: piIdFromCharge(ch),
        paidAt: new Date(ch.created * 1000),
        inThisMonth: nyMonthKey(new Date(ch.created * 1000)) === thisMonth,
        amount: (ch.amount_captured || ch.amount || 0) / 100,
        succeeded: ch.status === 'succeeded' || ch.paid === true,
      }))

      const piIds = [
        ...new Set(chargeRows.map((r) => r.piId).filter((id): id is string => !!id)),
      ]

      const [existingSales, existingOrders] = await Promise.all([
        piIds.length
          ? prisma.salesRecord.findMany({
              where: { stripePaymentIntentId: { in: piIds } },
              select: {
                id: true,
                stripePaymentIntentId: true,
                date: true,
                paidAmount: true,
              },
            })
          : Promise.resolve([]),
        piIds.length
          ? prisma.order.findMany({
              where: { stripePaymentIntentId: { in: piIds } },
              select: { id: true, stripePaymentIntentId: true, paymentStatus: true },
            })
          : Promise.resolve([]),
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

      for (const row of chargeRows) {
        summary.scanned++
        const { charge, piId, paidAt, inThisMonth, amount, succeeded } = row
        if (succeeded) summary.succeededSeen++
        if (succeeded && inThisMonth) summary.succeededThisMonth++

        const existing = piId ? saleByPi.get(piId) : undefined
        const sampleKey = piId || charge.id

        if (inThisMonth && summary.monthPiSample.length < 40) {
          summary.monthPiSample.push({
            paymentIntentId: sampleKey,
            status: succeeded ? 'succeeded' : charge.status,
            amount,
            created: paidAt.toISOString(),
            hasSalesRecord: !!existing,
            dbDate: existing?.date ? existing.date.toISOString() : null,
            dbAmount: existing ? Number(existing.paidAmount) : null,
            action: 'pending',
          })
        }

        if (!succeeded) continue
        if (!piId) continue
        if (seenPi.has(piId)) continue
        seenPi.add(piId)

        try {
          const linkedOrder = orderByPi.get(piId)
          if (!existing && linkedOrder?.paymentStatus === 'CAPTURED') {
            await syncSalesRecordFromOrder(linkedOrder.id)
            const after = await prisma.salesRecord.findFirst({
              where: {
                OR: [{ orderId: linkedOrder.id }, { stripePaymentIntentId: piId }],
              },
              select: { id: true, date: true, paidAmount: true },
            })
            if (after) {
              summary.syncedFromOrder++
              // Re-write date to charge paid time if order sync used the wrong day.
              if (!after.date || Math.abs(after.date.getTime() - paidAt.getTime()) > 60_000) {
                await prisma.salesRecord.update({
                  where: { id: after.id },
                  data: { date: paidAt },
                })
                summary.datesFixed++
              }
              const sample = summary.monthPiSample.find((s) => s.paymentIntentId === sampleKey)
              if (sample) {
                sample.action = 'synced from order'
                sample.hasSalesRecord = true
                sample.dbDate = paidAt.toISOString()
              }
              continue
            }
          }

          const pi = await stripe.paymentIntents.retrieve(
            piId,
            { expand: ['latest_charge', 'customer'] },
            requestOptions
          )
          if (pi.metadata?.source === 'connect_test') continue

          const platformSkip = await shouldSkipSalesIngestForPlatformInvoice(pi)
          if (platformSkip.skip) {
            summary.skippedPlatformInvoice++
            const sample = summary.monthPiSample.find((s) => s.paymentIntentId === sampleKey)
            if (sample) {
              sample.action = 'skipped platform invoice'
            }
            continue
          }

          const data = await salesRecordDataFromPaymentIntent(
            stripe,
            pi,
            costLookup,
            requestOptions
          )
          // Force paid-at from this charge (authoritative for MTD month).
          data.date = paidAt

          if (existing) {
            const dateWasWrong =
              !existing.date ||
              Math.abs(existing.date.getTime() - paidAt.getTime()) > 60_000 ||
              Number(existing.paidAmount) !== data.paidAmount

            await prisma.salesRecord.update({
              where: { id: existing.id },
              data,
            })
            summary.updated++
            if (dateWasWrong) summary.datesFixed++
            const sample = summary.monthPiSample.find((s) => s.paymentIntentId === sampleKey)
            if (sample) {
              sample.action = dateWasWrong ? 'date/amount fixed' : 'refreshed'
              sample.hasSalesRecord = true
              sample.dbDate = paidAt.toISOString()
              sample.dbAmount = data.paidAmount
            }
          } else {
            await prisma.salesRecord.create({
              data: { stripePaymentIntentId: piId, ...data },
            })
            summary.created++
            const sample = summary.monthPiSample.find((s) => s.paymentIntentId === sampleKey)
            if (sample) {
              sample.action = 'created'
              sample.hasSalesRecord = true
              sample.dbDate = paidAt.toISOString()
              sample.dbAmount = data.paidAmount
            }
          }
        } catch (rowErr) {
          summary.failed++
          const error = rowErr instanceof Error ? rowErr.message : String(rowErr)
          if (summary.failedSamples.length < 10) {
            summary.failedSamples.push({ paymentIntentId: piId, error })
          }
          const sample = summary.monthPiSample.find((s) => s.paymentIntentId === sampleKey)
          if (sample) sample.action = `failed: ${error.slice(0, 80)}`
          logger.warn('Stripe gap repair row failed', { paymentIntentId: piId, error })
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
