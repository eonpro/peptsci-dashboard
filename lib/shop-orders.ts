/**
 * Shared order-list query for the client shop.
 *
 * Used by both the server-rendered /shop/orders page (fast first paint on
 * refresh — no client fetch waterfall) and the /api/shop/orders route.
 */
import { prisma } from '@/lib/prisma'

export interface ShopOrderItem {
  name: string
  dose: string | null
  sku: string | null
  quantity: number
  unitPrice: number
  total: number
}

export interface ShopOrder {
  id: string
  orderNumber: number
  status: string
  shippingStatus: string | null
  total: number
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string | null
  createdAt: string
  items: ShopOrderItem[]
}

/** The client's non-draft orders, most recent first (JSON-safe shape). */
export async function listClientOrders(clientId: string): Promise<ShopOrder[]> {
  if (!prisma) throw new Error('Database not connected')

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

  return orders.map((o) => ({
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
}
