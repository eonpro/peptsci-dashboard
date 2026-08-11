/**
 * SUPER_ADMIN ops: restore clients with $0 shipping overrides (Elevated Vitality)
 * and back-bill missing under-$500 shipping on CAPTURED orders via add-on invoices.
 *
 * POST /api/admin/ops/backfill-missing-shipping
 *   {} or { "dryRun": true }  → list candidates + planned EV override clear (no writes)
 *   { "confirm": true }       → clear $0 EV overrides, invoice + charge, update Order totals
 */

import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { writeAudit } from '@/lib/audit'
import { createInvoice } from '@/lib/invoicing/service'
import { formatInvoiceNumber } from '@/lib/invoicing/core'
import { chargeInvoiceWithSavedCard } from '@/lib/stripe/charge-invoice-saved-card'
import { resolveOrderCreatorId } from '@/lib/orders/actor'
import { syncSalesRecordFromOrder } from '@/lib/sales'
import { FREE_SHIPPING_THRESHOLD, type ShipSpeed } from '@/lib/checkout-core'
import {
  EV_CLIENT_ID,
  invoiceMentionsShippingBackfill,
  isShippingBackfillCandidate,
  shippingBackfillAmount,
  shippingBackfillLineDescription,
  shippingBackfillMarker,
} from '@/lib/ops/backfill-missing-shipping'

export const dynamic = 'force-dynamic'

type CandidateRow = {
  id: string
  orderNumber: number
  clientId: string
  organizationName: string
  subtotal: number
  shippingTotal: number
  total: number
  shipSpeed: ShipSpeed
  shopifyOrderName: string | null
  amountDue: number
  lineDescription: string
}

async function loadEvShippingOverrides(): Promise<{
  twoDay: number | null
  overnight: number | null
  clearTwoDay: boolean
  clearOvernight: boolean
}> {
  if (!prisma) {
    return { twoDay: null, overnight: null, clearTwoDay: false, clearOvernight: false }
  }
  try {
    const rows = await prisma.$queryRaw<
      Array<{ shippingRateTwoDay: unknown; shippingRateOvernight: unknown }>
    >`
      SELECT "shippingRateTwoDay", "shippingRateOvernight"
      FROM "Client"
      WHERE id = ${EV_CLIENT_ID}
    `
    const row = rows[0]
    const twoDay = row?.shippingRateTwoDay != null ? Number(row.shippingRateTwoDay) : null
    const overnight =
      row?.shippingRateOvernight != null ? Number(row.shippingRateOvernight) : null
    return {
      twoDay,
      overnight,
      clearTwoDay: twoDay === 0,
      clearOvernight: overnight === 0,
    }
  } catch {
    return { twoDay: null, overnight: null, clearTwoDay: false, clearOvernight: false }
  }
}

async function clearEvZeroOverrides(clerkUserId: string | null): Promise<{
  clearedTwoDay: boolean
  clearedOvernight: boolean
}> {
  if (!prisma) return { clearedTwoDay: false, clearedOvernight: false }
  const current = await loadEvShippingOverrides()
  if (!current.clearTwoDay && !current.clearOvernight) {
    return { clearedTwoDay: false, clearedOvernight: false }
  }

  if (current.clearTwoDay && current.clearOvernight) {
    await prisma.$executeRaw`
      UPDATE "Client"
      SET "shippingRateTwoDay" = NULL, "shippingRateOvernight" = NULL
      WHERE id = ${EV_CLIENT_ID}
    `
  } else if (current.clearTwoDay) {
    await prisma.$executeRaw`
      UPDATE "Client" SET "shippingRateTwoDay" = NULL WHERE id = ${EV_CLIENT_ID}
    `
  } else if (current.clearOvernight) {
    await prisma.$executeRaw`
      UPDATE "Client" SET "shippingRateOvernight" = NULL WHERE id = ${EV_CLIENT_ID}
    `
  }

  void writeAudit({
    clerkUserId,
    entity: 'Client',
    entityId: EV_CLIENT_ID,
    action: 'ops_clear_zero_shipping_overrides',
    metadata: {
      fromTwoDay: current.twoDay,
      fromOvernight: current.overnight,
      clearedTwoDay: current.clearTwoDay,
      clearedOvernight: current.clearOvernight,
    },
  })

  return {
    clearedTwoDay: current.clearTwoDay,
    clearedOvernight: current.clearOvernight,
  }
}

async function findCandidates(): Promise<CandidateRow[]> {
  if (!prisma) return []

  const rows = await prisma.$queryRaw<
    Array<{
      id: string
      orderNumber: number
      clientId: string
      organizationName: string
      subtotal: unknown
      shippingTotal: unknown
      total: unknown
      shipSpeed: string | null
      shopifyOrderName: string | null
      paymentStatus: string
      status: string
    }>
  >`
    SELECT o.id, o."orderNumber", o."clientId", c."organizationName",
           o.subtotal, o."shippingTotal", o.total, o."shipSpeed", o."shopifyOrderName",
           o."paymentStatus"::text AS "paymentStatus", o.status::text AS status
    FROM "Order" o
    JOIN "Client" c ON c.id = o."clientId"
    WHERE o."paymentStatus" = 'CAPTURED'
      AND o.status::text NOT IN ('CANCELLED', 'DRAFT')
      AND COALESCE(o."shippingTotal", 0) <= 0
      AND o.subtotal > 0
      AND o.subtotal < ${FREE_SHIPPING_THRESHOLD}
    ORDER BY o."orderNumber" ASC
  `

  const candidates: CandidateRow[] = []
  for (const o of rows) {
    const subtotal = Number(o.subtotal)
    const shippingTotal = Number(o.shippingTotal ?? 0)
    if (
      !isShippingBackfillCandidate({
        orderNumber: Number(o.orderNumber),
        subtotal,
        shippingTotal,
        paymentStatus: o.paymentStatus,
        status: o.status,
        shipSpeed: o.shipSpeed,
      })
    ) {
      continue
    }

    const shipSpeed: ShipSpeed = o.shipSpeed === 'OVERNIGHT' ? 'OVERNIGHT' : 'TWO_DAY'
    const amountDue = shippingBackfillAmount(subtotal, shipSpeed)
    if (amountDue <= 0) continue

    const orderNumber = Number(o.orderNumber)
    candidates.push({
      id: o.id,
      orderNumber,
      clientId: o.clientId,
      organizationName: o.organizationName,
      subtotal,
      shippingTotal,
      total: Number(o.total),
      shipSpeed,
      shopifyOrderName: o.shopifyOrderName,
      amountDue,
      lineDescription: shippingBackfillLineDescription(
        orderNumber,
        shipSpeed,
        o.shopifyOrderName
      ),
    })
  }
  return candidates
}

async function alreadyBackfilled(orderNumber: number): Promise<boolean> {
  if (!prisma) return false
  const marker = shippingBackfillMarker(orderNumber)
  const hits = await prisma.invoice.findMany({
    where: {
      status: { in: ['OPEN', 'PARTIAL', 'OVERDUE', 'PAID'] },
      OR: [
        { notes: { contains: marker, mode: 'insensitive' } },
        { lineItems: { some: { description: { contains: marker, mode: 'insensitive' } } } },
      ],
    },
    select: {
      notes: true,
      lineItems: { select: { description: true } },
    },
    take: 20,
  })
  return hits.some((inv) =>
    invoiceMentionsShippingBackfill(
      [inv.notes, ...inv.lineItems.map((l) => l.description)],
      orderNumber
    )
  )
}

export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, isSuperAdmin, userId } = await requireSuperAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin || !isSuperAdmin) return forbiddenResponse('Super admin required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const body = (await request.json().catch(() => ({}))) as {
      confirm?: boolean
      dryRun?: boolean
    }
    const confirm = body.confirm === true
    const dryRun = !confirm || body.dryRun === true

    const evOverrides = await loadEvShippingOverrides()
    const candidates = await findCandidates()

    // Diagnostic: raw totals for recent EV Shopify orders (helps verify Decimal filters).
    let sampleOrders: Array<Record<string, unknown>> = []
    try {
      sampleOrders = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT "orderNumber", "subtotal", "shippingTotal", "total", "paymentStatus", "status", "shipSpeed", "shopifyOrderName"
        FROM "Order"
        WHERE "orderNumber" IN (266, 267, 268, 67)
        ORDER BY "orderNumber"
      `
      sampleOrders = sampleOrders.map((r) => ({
        orderNumber: Number(r.orderNumber),
        subtotal: Number(r.subtotal),
        shippingTotal: Number(r.shippingTotal),
        total: Number(r.total),
        paymentStatus: r.paymentStatus,
        status: r.status,
        shipSpeed: r.shipSpeed,
        shopifyOrderName: r.shopifyOrderName,
      }))
    } catch {
      sampleOrders = []
    }

    const planned: Array<CandidateRow & { skipReason?: string }> = []
    const skipped: Array<{ orderNumber: number; reason: string }> = []

    for (const c of candidates) {
      if (await alreadyBackfilled(c.orderNumber)) {
        skipped.push({ orderNumber: c.orderNumber, reason: 'already_backfilled' })
        continue
      }
      planned.push(c)
    }

    if (dryRun) {
      return successResponse({
        dryRun: true,
        globalMatrix: { under500: { TWO_DAY: 15, OVERNIGHT: 25 }, atOrAbove500: { TWO_DAY: 0, OVERNIGHT: 20 } },
        elevatedVitality: {
          clientId: EV_CLIENT_ID,
          shippingRateTwoDay: evOverrides.twoDay,
          shippingRateOvernight: evOverrides.overnight,
          willClearZeroOverrides: evOverrides.clearTwoDay || evOverrides.clearOvernight,
        },
        sampleOrders,
        planned,
        skipped,
        totals: {
          orders: planned.length,
          amount: planned.reduce((s, p) => s + p.amountDue, 0),
        },
      })
    }

    const cleared = await clearEvZeroOverrides(userId)

    let createdById: string
    try {
      createdById = await resolveOrderCreatorId(userId)
    } catch {
      return errorResponse('No admin user to attribute invoices', 500, 'NO_ORDER_ACTOR')
    }

    const charged: Array<{
      orderNumber: number
      invoiceId: string
      invoiceNumber: string
      amount: number
      paymentIntentId?: string
      newOrderTotal: number
    }> = []
    const failed: Array<{ orderNumber: number; reason: string }> = []

    for (const c of planned) {
      try {
        if (await alreadyBackfilled(c.orderNumber)) {
          skipped.push({ orderNumber: c.orderNumber, reason: 'already_backfilled' })
          continue
        }

        const notes = `Add-on ${shippingBackfillMarker(c.orderNumber)} (missing shipping/fulfillment fee)`
        const inv = await createInvoice({
          clientId: c.clientId,
          lineItems: [
            {
              description: c.lineDescription,
              quantity: 1,
              unitPrice: c.amountDue,
            },
          ],
          paymentTermsDays: 0,
          issue: true,
          notes,
          createdById,
        })

        const charge = await chargeInvoiceWithSavedCard({
          invoiceId: inv.invoice.id,
          metadata: {
            source: 'ops_backfill_missing_shipping',
            orderId: c.id,
            orderNumber: String(c.orderNumber),
          },
          notes: `Shipping backfill for Order #${c.orderNumber}`,
        })

        if (charge.status !== 'paid' && charge.status !== 'nothing_due') {
          failed.push({
            orderNumber: c.orderNumber,
            reason:
              charge.status === 'no_card'
                ? 'no_card'
                : charge.status === 'failed'
                  ? charge.message
                  : charge.status === 'requires_action'
                    ? 'requires_action'
                    : charge.status === 'stripe_unconfigured'
                      ? charge.message
                      : charge.status,
          })
          continue
        }

        const noteLine = `[ops ${new Date().toISOString().slice(0, 10)}] Charged $${c.amountDue.toFixed(2)} missing shipping (${formatInvoiceNumber(inv.invoice.invoiceNumber)}).`
        const order = await prisma.order.findUnique({
          where: { id: c.id },
          select: { shippingTotal: true, total: true, internalNotes: true },
        })
        if (!order) {
          failed.push({ orderNumber: c.orderNumber, reason: 'order_missing_after_charge' })
          continue
        }

        const newShipping = Math.round((Number(order.shippingTotal) + c.amountDue) * 100) / 100
        const newTotal = Math.round((Number(order.total) + c.amountDue) * 100) / 100
        const internalNotes = order.internalNotes
          ? `${order.internalNotes}\n${noteLine}`
          : noteLine

        await prisma.order.update({
          where: { id: c.id },
          data: {
            shippingTotal: new Prisma.Decimal(newShipping),
            total: new Prisma.Decimal(newTotal),
            internalNotes,
          },
        })

        await syncSalesRecordFromOrder(c.id).catch((e) =>
          logger.warn('[ops backfill-shipping] sales sync failed (non-blocking)', {
            orderId: c.id,
            error: e instanceof Error ? e.message : String(e),
          })
        )

        void writeAudit({
          clerkUserId: userId,
          entity: 'Order',
          entityId: c.id,
          action: 'ops_backfill_missing_shipping',
          orderId: c.id,
          metadata: {
            orderNumber: c.orderNumber,
            amount: c.amountDue,
            invoiceId: inv.invoice.id,
            invoiceNumber: inv.invoice.invoiceNumber,
            chargeStatus: charge.status,
            paymentIntentId: 'paymentIntentId' in charge ? charge.paymentIntentId : null,
          },
        })

        charged.push({
          orderNumber: c.orderNumber,
          invoiceId: inv.invoice.id,
          invoiceNumber: formatInvoiceNumber(inv.invoice.invoiceNumber),
          amount: c.amountDue,
          paymentIntentId: 'paymentIntentId' in charge ? charge.paymentIntentId || undefined : undefined,
          newOrderTotal: newTotal,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('[ops backfill-missing-shipping] order failed', {
          orderNumber: c.orderNumber,
          error: message,
        })
        failed.push({ orderNumber: c.orderNumber, reason: message.slice(0, 300) })
      }
    }

    logger.info('[ops] backfill-missing-shipping complete', {
      charged: charged.length,
      failed: failed.length,
      skipped: skipped.length,
      cleared,
    })

    return successResponse({
      dryRun: false,
      elevatedVitality: {
        clientId: EV_CLIENT_ID,
        ...cleared,
      },
      charged,
      skipped,
      failed,
      totals: {
        charged: charged.length,
        amount: charged.reduce((s, c) => s + c.amount, 0),
        failed: failed.length,
      },
    })
  } catch (error) {
    logger.error(
      '[ops backfill-missing-shipping]',
      {},
      error instanceof Error ? error : undefined
    )
    return errorResponse('Failed to backfill missing shipping')
  }
}
