/**
 * Distributor purchase orders + expenses, sourced from Postgres
 * (DistributorOrder + DistributorOrderLine). Replaces the former Google Sheets
 * "Orders /Expenses" tab. The `DistributorOrder` shape is preserved so the
 * orders-expenses page and lib/finance.ts (balance sheet) are unchanged.
 * Populated via CSV upload (/api/admin/distributor-orders/import).
 */

import { prisma } from './prisma'
import { logger } from './logger'

export interface DistributorOrder {
  id: string
  orderDate: Date | null
  vendor: string
  products: {
    name: string
    dose: string
    quantity: number
    unitCost: number
    total: number
  }[]
  subtotal: number
  shipping: number
  paypalFee: number
  total: number
  status: 'pending' | 'shipped' | 'delivered'
  trackingNumber?: string
}

function normalizeStatus(status: string): DistributorOrder['status'] {
  const s = status.toLowerCase()
  if (s === 'pending' || s === 'shipped' || s === 'delivered') return s
  return 'delivered'
}

export async function getDistributorOrders(): Promise<DistributorOrder[]> {
  if (!prisma) return []
  try {
    const rows = await prisma.distributorOrder.findMany({
      include: { lines: true },
      orderBy: { orderDate: 'desc' },
    })

    return rows.map((o) => ({
      id: o.externalId || o.id,
      orderDate: o.orderDate,
      vendor: o.vendor,
      products: o.lines.map((l) => ({
        name: l.productName,
        dose: l.dose,
        quantity: l.quantity,
        unitCost: Number(l.unitCost),
        total: Number(l.lineTotal),
      })),
      subtotal: Number(o.subtotal),
      shipping: Number(o.shipping),
      paypalFee: Number(o.paypalFee),
      total: Number(o.total),
      status: normalizeStatus(o.status),
      trackingNumber: o.trackingNumber ?? undefined,
    }))
  } catch (error) {
    logger.error(
      'Error fetching distributor orders',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return []
  }
}
