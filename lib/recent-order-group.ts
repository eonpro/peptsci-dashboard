/**
 * Group Recent Orders by order number so two same-day orders for one practice
 * do not render as a single expanded row with mixed unit prices.
 *
 * Kept free of Prisma / `@/lib/sales` so the dashboard client bundle can import
 * it without pulling `pg` / `net` into webpack (same class of bug as
 * isOpsRecentSale).
 */
export function recentOrderGroupKey(sale: {
  OrderID: string
  CustomerName: string
  Date: Date | string | null
}): string | null {
  if (!sale.Date) return null
  if (sale.OrderID) return `order_${sale.OrderID}`
  const dateObj = sale.Date instanceof Date ? sale.Date : new Date(sale.Date)
  const dateKey = Number.isNaN(dateObj.getTime()) ? '' : dateObj.toISOString().split('T')[0]
  return `customer_${sale.CustomerName}_${dateKey}`
}
