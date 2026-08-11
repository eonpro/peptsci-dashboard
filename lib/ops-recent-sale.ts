import type { Sale } from '@/lib/sales'

/** Terminal / non-actionable order statuses — hide from Recent Orders ops queue. */
const NON_OPS_ORDER_STATUSES = new Set(['CANCELLED', 'REJECTED', 'DRAFT'])

/** True when a sale should appear in the home Recent Orders action list. */
export function isOpsRecentSale(sale: Pick<Sale, 'OrderStatus'>): boolean {
  const status = sale.OrderStatus
  if (!status) return true
  return !NON_OPS_ORDER_STATUSES.has(status)
}
