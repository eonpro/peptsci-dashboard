import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'

export const dynamic = 'force-dynamic'

/** GET /api/shop/orders — the authenticated client's orders (most recent first). */
export async function GET(_request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const orders = await prisma.order.findMany({
      where: { clientId, status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        shippingStatus: true,
        total: true,
        carrier: true,
        trackingNumber: true,
        trackingUrl: true,
        shippedAt: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            variant: {
              select: { dose: true, sku: true, product: { select: { name: true } } },
            },
          },
        },
      },
    })

    const data = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      shippingStatus: o.shippingStatus,
      total: Number(o.total),
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      shippedAt: o.shippedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((it) => ({
        name: it.variant.product.name,
        dose: it.variant.dose,
        sku: it.variant.sku,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        total: Number(it.totalPrice),
      })),
    }))

    return successResponse({ orders: data })
  } catch (error) {
    logger.error('[shop/orders] list error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load orders')
  }
}
