import type Stripe from 'stripe'
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
export const maxDuration = 300

interface MissingPi {
  id: string
  amount: number
  created: string
  description: string
  status: string
}

/**
 * GET /api/admin/sales/stripe-reconcile
 *
 * Read-only reconciliation between the connected Stripe account and
 * SalesRecord. Answers "why don't the numbers match": scans every
 * PaymentIntent on the account, totals gross/refunded/net volume, compares
 * against what the dashboard has ingested, and lists succeeded payments that
 * are missing from analytics. Admin only; makes no writes.
 */
export async function GET() {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')
    const stripe = getStripeClient()
    if (!stripe) return errorResponse('Stripe is not configured', 503, 'STRIPE_NOT_CONFIGURED')

    const requestOptions = connectRequestOptions()

    // ── Stripe side: scan every PaymentIntent ────────────────────────────────
    let succeededCount = 0
    let grossVolume = 0 // sum of succeeded PI amounts (cents)
    let refundedTotal = 0 // cents refunded against succeeded PIs
    let nonSucceededCount = 0
    const succeededPis = new Map<string, MissingPi>()

    let startingAfter: string | undefined
    let scanned = 0
    const MAX_SCAN = 20_000

    for (;;) {
      const page: Stripe.ApiList<Stripe.PaymentIntent> = await stripe.paymentIntents.list(
        {
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
          expand: ['data.latest_charge'],
        },
        requestOptions
      )
      for (const pi of page.data) {
        scanned++
        if (pi.status !== 'succeeded') {
          nonSucceededCount++
          continue
        }
        const amount = pi.amount_received || pi.amount || 0
        succeededCount++
        grossVolume += amount
        const charge =
          pi.latest_charge && typeof pi.latest_charge === 'object'
            ? (pi.latest_charge as Stripe.Charge)
            : null
        refundedTotal += charge?.amount_refunded ?? 0
        succeededPis.set(pi.id, {
          id: pi.id,
          amount: amount / 100,
          created: new Date(pi.created * 1000).toISOString(),
          description: pi.description || '',
          status: pi.status,
        })
      }
      if (!page.has_more || scanned >= MAX_SCAN) break
      startingAfter = page.data[page.data.length - 1]?.id
    }

    // ── DB side: what analytics has ingested ────────────────────────────────
    const bySource = await prisma.salesRecord.groupBy({
      by: ['source'],
      _sum: { paidAmount: true },
      _count: { _all: true },
    })
    const dbTotal = bySource.reduce((s, g) => s + Number(g._sum.paidAmount ?? 0), 0)

    // PI ids already represented in analytics (stripe-sourced records) or by a
    // platform order (order-sourced records carry the PI id too).
    const knownRecords = await prisma.salesRecord.findMany({
      where: { stripePaymentIntentId: { not: null } },
      select: { stripePaymentIntentId: true },
    })
    const knownOrders = await prisma.order.findMany({
      where: { stripePaymentIntentId: { not: null } },
      select: { stripePaymentIntentId: true },
    })
    const known = new Set<string>([
      ...knownRecords.map((r) => r.stripePaymentIntentId as string),
      ...knownOrders.map((o) => o.stripePaymentIntentId as string),
    ])

    const missing = [...succeededPis.values()].filter((pi) => !known.has(pi.id))
    const missingAmount = missing.reduce((s, m) => s + m.amount, 0)

    const result = {
      stripe: {
        scannedPaymentIntents: scanned,
        succeededCount,
        nonSucceededCount,
        grossVolume: grossVolume / 100,
        refundedTotal: refundedTotal / 100,
        netVolume: (grossVolume - refundedTotal) / 100,
      },
      db: {
        totalSales: dbTotal,
        bySource: Object.fromEntries(
          bySource.map((g) => [
            g.source,
            { count: g._count._all, amount: Number(g._sum.paidAmount ?? 0) },
          ])
        ),
      },
      gap: {
        stripeGrossVsDb: grossVolume / 100 - dbTotal,
        missingFromDb: { count: missing.length, amount: missingAmount },
      },
      missingSample: missing
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 100),
    }

    logger.info('Stripe reconcile completed', {
      scanned,
      succeededCount,
      missing: missing.length,
    })
    return successResponse(result)
  } catch (error) {
    logger.error(
      'Error reconciling Stripe',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to reconcile with Stripe')
  }
}
