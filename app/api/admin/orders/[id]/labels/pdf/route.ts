import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import {
  allocatableBatchesForVariants,
  planAllocation,
  recordLabelsPrintedMany,
} from '@/lib/inventory-batches'
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
    const draws: Array<{ batchId: string; qty: number }> = []

    // Fetch eligible batches for every line item's variant in one query
    // (instead of one query per item).
    const batchesByVariant = await allocatableBatchesForVariants(
      order.items.map((item) => item.variantId)
    )

    for (const item of order.items) {
      const batches = batchesByVariant.get(item.variantId) ?? []
      const plan = planAllocation(
        batches.map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          bud: b.bud,
          qtyOnHand: b.qtyOnHand,
        })),
        item.quantity
      )
      if (plan.shortfall > 0) {
        shortfalls.push({ variantId: item.variantId, needed: item.quantity, short: plan.shortfall })
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
        draws.push({ batchId: draw.batchId, qty: draw.qty })
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
      await recordLabelsPrintedMany(draws, { clerkUserId: userId, label: userId })
      logger.info('Order labels generated + stock consumed', { orderId: id, draws: draws.length })
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
