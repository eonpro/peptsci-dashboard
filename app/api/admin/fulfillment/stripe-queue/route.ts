import { NextRequest } from 'next/server'
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
import { formatInvoiceNumber } from '@/lib/invoicing/core'
import { excludePlatformInvoiceQueueRows } from '@/lib/fulfillment/stripe-queue'
import { parseStripeSaleLineItems } from '@/lib/fulfillment/stripe-line-map'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).optional().default(60),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
})

/**
 * GET /api/admin/fulfillment/stripe-queue
 *
 * External Stripe payments (source `stripe`) that have NOT yet been converted
 * into a fulfillable order (`orderId` still null). These are paid but have no
 * picked/packed/shipped order — the operator maps invoice lines to catalog
 * variants to convert them. Defaults to the last 60 days ("going forward");
 * pass ?days= to widen. Suggests a client match by email. Admin only.
 *
 * Platform invoice payments (InvoicePayment.stripePaymentIntentId) are excluded
 * — those fulfill via Invoice → Queue fulfillment, not this Convert queue.
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const since = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000)

    // Over-fetch so filtering platform-invoice PIs still fills `limit`.
    const fetchTake = Math.min(200, Math.max(params.limit * 3, params.limit + 40))

    const records = await prisma.salesRecord.findMany({
      where: {
        source: 'stripe',
        orderId: null,
        invoicePaid: true,
        date: { gte: since },
      },
      orderBy: { date: 'desc' },
      take: fetchTake,
      select: {
        id: true,
        date: true,
        orderRef: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        address: true,
        address2: true,
        city: true,
        state: true,
        zip: true,
        product: true,
        vials: true,
        paidAmount: true,
        stripePaymentIntentId: true,
        lineItems: true,
      },
    })

    const piIds = Array.from(
      new Set(records.map((r) => r.stripePaymentIntentId).filter((id): id is string => !!id))
    )
    const platformByPi = new Map<string, { invoiceId: string; invoiceNumber: number }>()
    if (piIds.length > 0) {
      const payments = await prisma.invoicePayment.findMany({
        where: { stripePaymentIntentId: { in: piIds } },
        select: {
          stripePaymentIntentId: true,
          invoiceId: true,
          invoice: { select: { invoiceNumber: true } },
        },
      })
      for (const p of payments) {
        if (p.stripePaymentIntentId) {
          platformByPi.set(p.stripePaymentIntentId, {
            invoiceId: p.invoiceId,
            invoiceNumber: p.invoice.invoiceNumber,
          })
        }
      }
    }

    const external = excludePlatformInvoiceQueueRows(records, new Set(platformByPi.keys())).slice(
      0,
      params.limit
    )

    // Suggest a client match by contact email (case-insensitive), best-effort.
    const emails = Array.from(
      new Set(external.map((r) => r.customerEmail.trim().toLowerCase()).filter(Boolean))
    )
    const clientsByEmail = new Map<string, { id: string; organizationName: string }>()
    if (emails.length > 0) {
      const clients = await prisma.client.findMany({
        where: { contactEmail: { in: emails, mode: 'insensitive' } },
        select: { id: true, organizationName: true, contactEmail: true },
      })
      for (const c of clients) {
        if (c.contactEmail) {
          clientsByEmail.set(c.contactEmail.trim().toLowerCase(), {
            id: c.id,
            organizationName: c.organizationName,
          })
        }
      }
    }

    const data = external.map((r) => {
      const match = clientsByEmail.get(r.customerEmail.trim().toLowerCase()) ?? null
      return {
        id: r.id,
        date: r.date?.toISOString() ?? null,
        orderRef: r.orderRef,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        customerPhone: r.customerPhone,
        address: {
          address: r.address,
          address2: r.address2,
          city: r.city,
          state: r.state,
          zip: r.zip,
        },
        product: r.product,
        vials: r.vials,
        paidAmount: Number(r.paidAmount),
        stripePaymentIntentId: r.stripePaymentIntentId,
        lineItems: parseStripeSaleLineItems(r.lineItems),
        matchedClient: match,
      }
    })

    const platformExcludedCount = records.filter(
      (r) => r.stripePaymentIntentId && platformByPi.has(r.stripePaymentIntentId)
    ).length

    return successResponse({
      records: data,
      meta: {
        days: params.days,
        count: data.length,
        platformInvoiceExcluded: platformExcludedCount,
        platformInvoiceSamples: Array.from(platformByPi.values())
          .slice(0, 5)
          .map((p) => ({
            invoiceId: p.invoiceId,
            label: formatInvoiceNumber(p.invoiceNumber),
          })),
      },
    })
  } catch (error) {
    logger.error('[stripe-queue] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load Stripe fulfillment queue')
  }
}
