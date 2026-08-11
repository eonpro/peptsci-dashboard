/**
 * Shared order-list query for the client shop.
 *
 * Used by both the server-rendered /shop/orders page (fast first paint on
 * refresh — no client fetch waterfall) and the /api/shop/orders route.
 */
import { prisma } from '@/lib/prisma'
import { displayProductName } from '@/lib/products/named-blends'

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
  shippingTotal: number
  shipSpeed: string
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string | null
  createdAt: string
  source: string
  shopifyOrderName: string | null
  shipTo: string
  shipToName: string | null
  items: ShopOrderItem[]
}

function shipToNameFromAddress(addr: unknown): string | null {
  if (!addr || typeof addr !== 'object' || Array.isArray(addr)) return null
  const a = addr as Record<string, unknown>
  const name = typeof a.name === 'string' ? a.name.trim() : ''
  if (name) return name
  const company = typeof a.company === 'string' ? a.company.trim() : ''
  return company || null
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
      shippingTotal: true,
      shipSpeed: true,
      carrier: true,
      trackingNumber: true,
      trackingUrl: true,
      shippedAt: true,
      createdAt: true,
      source: true,
      shopifyOrderName: true,
      shipTo: true,
      shippingAddress: true,
      patient: { select: { firstName: true, lastName: true } },
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

  return orders.map((o) => {
    const fromPatient = o.patient
      ? `${o.patient.firstName} ${o.patient.lastName}`.replace(/\s+—\s*$/, '').trim()
      : null
    const shipToName =
      o.shipTo === 'PATIENT' || o.source === 'SHOPIFY'
        ? fromPatient || shipToNameFromAddress(o.shippingAddress)
        : null

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      shippingStatus: o.shippingStatus,
      total: Number(o.total),
      shippingTotal: Number(o.shippingTotal),
      shipSpeed: o.shipSpeed,
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      shippedAt: o.shippedAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
      source: o.source,
      shopifyOrderName: o.shopifyOrderName,
      shipTo: o.shipTo,
      shipToName,
      items: o.items.map((it) => ({
        name: displayProductName(it.variant.product.name, it.variant.sku),
        dose: it.variant.dose,
        sku: it.variant.sku,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        total: Number(it.totalPrice),
      })),
    }
  })
}
