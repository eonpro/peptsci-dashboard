import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { allocatableBatchesForVariants, planAllocation } from '@/lib/inventory-batches'
import { consumeOrderInventory } from '@/lib/fulfillment/service'
import { generatePeptSciLabelsPdf, type PeptSciLabelGroup } from '@/lib/labels/peptsciLabelPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/orders/[id]/labels/pdf
 * On command, generate a label sheet for an order: for each line item, draw the
 * required vial count from inventory batches FIFO (soonest BUD first) and emit a
 * label per vial. Pass `?consume=true` to decrement stock as fulfilled; default
 * is a non-consuming preview.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'NO_DB')

    const { id } = await params
    const consume = new URL(request.url).searchParams.get('consume') === 'true'

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: { include: { variant: true } } },
    })
    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')

    const groups: PeptSciLabelGroup[] = []
    const shortfalls: Array<{ variantId: string; needed: number; short: number }> = []

    // Fetch eligible batches for every line item's variant in one query
    // (instead of one query per item).
    const batchesByVariant = await allocatableBatchesForVariants(
      order.items.map((item) => item.variantId)
    )

    // Aggregate quantities by variant BEFORE planning — a variant appearing on
    // more than one order line must be planned against the shared batch stock
    // once, otherwise each line plans against full on-hand and the label sheet
    // (and any consume) can exceed physical inventory.
    const qtyByVariant = new Map<string, number>()
    for (const item of order.items) {
      qtyByVariant.set(item.variantId, (qtyByVariant.get(item.variantId) ?? 0) + item.quantity)
    }

    for (const [variantId, needed] of qtyByVariant) {
      const batches = batchesByVariant.get(variantId) ?? []
      const plan = planAllocation(
        batches.map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          bud: b.bud,
          qtyOnHand: b.qtyOnHand,
        })),
        needed
      )
      if (plan.shortfall > 0) {
        shortfalls.push({ variantId, needed, short: plan.shortfall })
      }
      for (const draw of plan.draws) {
        const batch = batches.find((b) => b.id === draw.batchId)!
        groups.push({
          req: {
            productName: batch.productName,
            dose: batch.dose,
            purity: batch.purity,
            batchNumber: batch.batchNumber,
            budIsoDate: batch.bud.toISOString().slice(0, 10),
            accentColor: batch.yearColor || undefined,
          },
          quantity: draw.qty,
        })
      }
    }

    if (consume && shortfalls.length > 0) {
      return errorResponse(
        'Insufficient batch stock to fulfill this order. Receive more inventory before consuming.',
        409,
        'INSUFFICIENT_STOCK'
      )
    }

    const pdf = await generatePeptSciLabelsPdf(groups)

    if (consume) {
      // Single transaction: draw stock atomically (per-batch conditional
      // decrement) AND move reservations to CONSUMED. Idempotent — a repeat
      // consume on an already-fulfilled order is a no-op.
      try {
        const res = await consumeOrderInventory(id, { clerkUserId: userId, label: userId }, { requireFull: true })
        logger.info('Order labels generated + stock consumed', {
          orderId: id,
          draws: res.draws,
          alreadyConsumed: res.alreadyConsumed,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('Insufficient batch stock')) {
          return errorResponse(
            'Insufficient batch stock to fulfill this order. Receive more inventory before consuming.',
            409,
            'INSUFFICIENT_STOCK'
          )
        }
        if (msg.includes('changed during fulfillment')) {
          return errorResponse('Inventory changed during fulfillment; please retry.', 409, 'CONCURRENT_MODIFICATION')
        }
        throw e
      }
    }

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="peptsci-order-${order.orderNumber}-labels.pdf"`,
        'Cache-Control': 'no-store',
        'X-Label-Shortfall': shortfalls.length > 0 ? JSON.stringify(shortfalls) : '',
      },
    })
  } catch (error) {
    logger.error(
      'Error generating order labels',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to generate order labels')
  }
}
