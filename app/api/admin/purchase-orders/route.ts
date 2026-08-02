import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PurchaseOrderItemInput {
  productName?: unknown
  dose?: unknown
  sku?: unknown
  quantity?: unknown
  unitCost?: unknown
}

/**
 * POST /api/admin/purchase-orders
 *
 * Record a placed purchase order (from the PO Generator's "Did you place the
 * order?" confirmation) as a pending DistributorOrder. This makes the spend
 * show up on Orders & Expenses + the P&L balance sheet immediately, and the
 * line quantities count as "incoming" stock on the Inventory page until the
 * batches are physically received (which auto-applies against these lines).
 * Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return errorResponse('Invalid request body', 400, 'VALIDATION')
    }

    const poNumber = typeof body.poNumber === 'string' ? body.poNumber.trim() : ''
    const vendor = typeof body.vendor === 'string' ? body.vendor.trim() : ''
    const orderDateRaw = typeof body.orderDate === 'string' ? body.orderDate.trim() : ''
    const rawItems: PurchaseOrderItemInput[] = Array.isArray(body.items) ? body.items : []

    if (!poNumber) return errorResponse('PO number is required', 400, 'VALIDATION')

    // Date arrives as yyyy-MM-dd from the PO form's date input.
    let orderDate = new Date()
    if (orderDateRaw) {
      const parsed = new Date(`${orderDateRaw}T00:00:00.000Z`)
      if (Number.isNaN(parsed.getTime())) {
        return errorResponse('Invalid order date', 400, 'VALIDATION')
      }
      orderDate = parsed
    }

    const items = rawItems
      .map((item) => ({
        productName: typeof item.productName === 'string' ? item.productName.trim() : '',
        dose: typeof item.dose === 'string' ? item.dose.trim() : '',
        sku: typeof item.sku === 'string' && item.sku.trim() ? item.sku.trim() : null,
        quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)),
        unitCost: Math.max(0, Number(item.unitCost) || 0),
      }))
      .filter((item) => item.productName && item.quantity > 0)

    if (items.length === 0) {
      return errorResponse('At least one item with a quantity is required', 400, 'VALIDATION')
    }

    const subtotal = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0)
    const roundedSubtotal = Math.round((subtotal + Number.EPSILON) * 100) / 100

    const order = await prisma.distributorOrder.create({
      data: {
        externalId: poNumber,
        orderDate,
        vendor: vendor || 'TBD',
        subtotal: roundedSubtotal,
        shipping: 0,
        paypalFee: 0,
        total: roundedSubtotal,
        status: 'pending',
        lines: {
          create: items.map((item) => ({
            productName: item.productName,
            dose: item.dose,
            sku: item.sku,
            quantity: item.quantity,
            unitCost: item.unitCost,
            lineTotal: Math.round((item.unitCost * item.quantity + Number.EPSILON) * 100) / 100,
          })),
        },
      },
      select: { id: true, externalId: true, total: true },
    })

    logger.info('Purchase order recorded', {
      poNumber,
      vendor,
      items: items.length,
      total: roundedSubtotal,
    })

    return successResponse({ order }, 201)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse('This PO number has already been recorded', 409, 'DUPLICATE_PO')
    }
    logger.error(
      'Error recording purchase order',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to record purchase order')
  }
}
