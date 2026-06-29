import { NextRequest } from 'next/server'
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

/**
 * GET /api/admin/returns/order-lookup?orderNumber= | ?orderId=
 * Resolves an order and its line items (with variant linkage + product name)
 * so the "New Return" dialog can pre-fill returnable items.
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const url = new URL(request.url)
    const orderId = url.searchParams.get('orderId')
    const orderNumberRaw = url.searchParams.get('orderNumber')
    const orderNumber = orderNumberRaw ? Number(orderNumberRaw.replace(/[^0-9]/g, '')) : NaN

    if (!orderId && !Number.isFinite(orderNumber)) {
      return errorResponse('Provide orderId or orderNumber', 400, 'VALIDATION_ERROR')
    }

    const order = await prisma.order.findFirst({
      where: orderId ? { id: orderId } : { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        client: { select: { id: true, organizationName: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            variant: {
              select: {
                id: true,
                dose: true,
                sku: true,
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    })

    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')

    return successResponse({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      client: order.client,
      items: order.items.map((it) => ({
        orderItemId: it.id,
        variantId: it.variant?.id ?? null,
        productName: [it.variant?.product?.name, it.variant?.dose].filter(Boolean).join(' ').trim() ||
          it.variant?.sku ||
          'Item',
        quantityOrdered: it.quantity,
      })),
    })
  } catch (error) {
    logger.error('[returns order-lookup] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to look up order')
  }
}
