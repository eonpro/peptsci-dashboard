import { format, startOfMonth, endOfMonth } from 'date-fns'
import type { Sale } from './sales'
import type { Inventory } from './inventory'
import type { DistributorOrder } from './orders'

export interface ProductContribution {
  product: string
  revenue: number
  cogs: number
  profit: number
  vials: number
  orders: number
}

export interface ProfitLossTotals {
  revenue: number
  cogs: number
  grossProfit: number
  grossMargin: number
  expenses: {
    shipping: number
    marketing: number
    operations: number
    other: number
    total: number
  }
  netProfit: number
  netMargin: number
  orderCount: number
  productBreakdown: ProductContribution[]
}

export interface MonthlyProfitLoss extends ProfitLossTotals {
  monthKey: string // yyyy-MM
  label: string
  year: number
  month: number // 1-12
  startDate: Date
  endDate: Date
}

export interface YearToDateProfitLoss extends ProfitLossTotals {
  year: number
  throughMonth: number
  label: string
  monthsIncluded: number[]
}

export interface InventoryValuationItem {
  sku: string
  product: string
  dose: string
  unitCost: number
  onHand: number
  value: number
}

export interface InventoryValuationSummary {
  items: InventoryValuationItem[]
  totalInventoryValue: number
  totalOnHandUnits: number
}

export interface InventorySpendSummary {
  orders: number
  totalSpend: number
  products: number
  shipping: number
  fees: number
  year?: number
}

export interface BalanceSheetSummary {
  asOf: Date
  inventory: InventoryValuationSummary
  spendAllTime: InventorySpendSummary
  spendYTD?: InventorySpendSummary
  outstandingOrdersValue: number
}

const buildEmptyExpenses = () => ({
  shipping: 0,
  marketing: 0,
  operations: 0,
  other: 0,
  total: 0,
})

const toMonthKey = (date: Date) => format(date, 'yyyy-MM')

const getPaidSales = (sales: Sale[]) =>
  sales.filter((sale) => sale.Date instanceof Date && sale.PaidAmount > 0)

const aggregateSales = (sales: Sale[]): ProfitLossTotals => {
  const uniqueOrders = new Set<string>()
  const productMap = new Map<string, ProductContribution>()

  const revenue = sales.reduce((sum, sale) => {
    if (!sale.Date) return sum
    uniqueOrders.add(sale.OrderID)
    const productKey = sale.Product || 'Unknown Product'
    const existing = productMap.get(productKey) ?? {
      product: productKey,
      revenue: 0,
      cogs: 0,
      profit: 0,
      vials: 0,
      orders: 0,
    }
    existing.revenue += sale.PaidAmount
    existing.cogs += sale.COGS
    existing.profit += sale.PaidAmount - sale.COGS
    existing.vials += sale.Vials
    existing.orders += 1
    productMap.set(productKey, existing)
    return sum + sale.PaidAmount
  }, 0)

  const cogs = sales.reduce((sum, sale) => sum + sale.COGS, 0)
  const grossProfit = revenue - cogs
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const expenses = buildEmptyExpenses()
  const netProfit = grossProfit - expenses.total
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0

  const productBreakdown = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue)

  return {
    revenue,
    cogs,
    grossProfit,
    grossMargin,
    expenses,
    netProfit,
    netMargin,
    orderCount: uniqueOrders.size,
    productBreakdown,
  }
}

/**
 * Aggregates paid sales into monthly P&L summaries.
 *
 * Only sales with `PaidAmount > 0` and a valid `Date` are included.
 * Each month includes revenue, COGS, gross/net profit, margins, and
 * a product-level contribution breakdown.
 *
 * @param sales - Array of sales records from Google Sheets
 * @returns Sorted array of monthly summaries (oldest to newest)
 */
export const calculateMonthlyProfitLoss = (sales: Sale[]): MonthlyProfitLoss[] => {
  const paidSales = getPaidSales(sales)
  const monthBuckets = new Map<string, Sale[]>()

  paidSales.forEach((sale) => {
    const monthKey = toMonthKey(sale.Date!)
    const bucket = monthBuckets.get(monthKey) ?? []
    bucket.push(sale)
    monthBuckets.set(monthKey, bucket)
  })

  const summaries: MonthlyProfitLoss[] = Array.from(monthBuckets.entries()).map(
    ([monthKey, monthSales]) => {
      const anyDate = monthSales[0].Date!
      const {
        revenue,
        cogs,
        grossProfit,
        grossMargin,
        expenses,
        netProfit,
        netMargin,
        orderCount,
        productBreakdown,
      } = aggregateSales(monthSales)
      const month = anyDate.getMonth() + 1
      const year = anyDate.getFullYear()
      return {
        monthKey,
        label: format(anyDate, 'MMMM yyyy'),
        year,
        month,
        startDate: startOfMonth(anyDate),
        endDate: endOfMonth(anyDate),
        revenue,
        cogs,
        grossProfit,
        grossMargin,
        expenses,
        netProfit,
        netMargin,
        orderCount,
        productBreakdown,
      }
    }
  )

  summaries.sort((a, b) => {
    if (a.year === b.year) {
      return a.month - b.month
    }
    return a.year - b.year
  })

  return summaries
}

/**
 * Calculates year-to-date aggregated P&L for a given year.
 *
 * Includes all paid sales from January through the specified month (or
 * the latest month with data if `throughMonth` is omitted).
 *
 * @param sales - Array of sales records
 * @param year - Calendar year to aggregate (e.g., 2025)
 * @param throughMonth - Optional month number (1-12) to cap aggregation
 * @returns YTD summary or null if no paid sales exist for that year
 */
export const calculateYearToDateProfitLoss = (
  sales: Sale[],
  year: number,
  throughMonth?: number
): YearToDateProfitLoss | null => {
  const paidSales = getPaidSales(sales).filter((sale) => sale.Date!.getFullYear() === year)
  if (paidSales.length === 0) {
    return null
  }

  const monthLimit =
    typeof throughMonth === 'number'
      ? throughMonth
      : Math.max(...paidSales.map((sale) => sale.Date!.getMonth() + 1))

  const filtered = paidSales.filter((sale) => sale.Date!.getMonth() + 1 <= monthLimit)

  if (filtered.length === 0) {
    return null
  }

  const summary = aggregateSales(filtered)
  const monthsIncluded = Array.from(
    new Set(filtered.map((sale) => sale.Date!.getMonth() + 1))
  ).sort((a, b) => a - b)

  return {
    year,
    throughMonth: monthLimit,
    label: `YTD ${year} (through ${format(new Date(year, monthLimit - 1, 1), 'MMMM')})`,
    monthsIncluded,
    ...summary,
  }
}

const summariseInventory = (inventory: Inventory[]): InventoryValuationSummary => {
  const items = inventory.map((item) => {
    const onHand = Math.max(0, item.InventoryAvailable)
    const unitCost = Math.max(0, item.Cost)
    const value = onHand * unitCost
    return {
      sku: item.SKU,
      product: item.MedicationName,
      dose: item.Dose,
      unitCost,
      onHand,
      value,
    }
  })

  items.sort((a, b) => b.value - a.value)

  const totalInventoryValue = items.reduce((sum, item) => sum + item.value, 0)
  const totalOnHandUnits = items.reduce((sum, item) => sum + item.onHand, 0)

  return {
    items,
    totalInventoryValue,
    totalOnHandUnits,
  }
}

const summariseSpend = (
  orders: DistributorOrder[],
  filter?: (order: DistributorOrder) => boolean
): InventorySpendSummary => {
  const relevant = filter ? orders.filter(filter) : orders
  const ordersCount = relevant.length

  const totals = relevant.reduce(
    (acc, order) => {
      acc.total += order.total
      acc.products += order.subtotal
      acc.shipping += order.shipping
      acc.fees += order.paypalFee
      return acc
    },
    { total: 0, products: 0, shipping: 0, fees: 0 }
  )

  return {
    orders: ordersCount,
    totalSpend: totals.total,
    products: totals.products,
    shipping: totals.shipping,
    fees: totals.fees,
  }
}

/**
 * Generates a balance sheet snapshot combining inventory valuation and
 * distributor spend summaries.
 *
 * - **Inventory Value**: On-hand units × unit cost for each SKU
 * - **Spend All-Time**: Total distributor order spend
 * - **Spend YTD**: Distributor spend for `options.year` if provided
 * - **Outstanding Orders**: Value of orders not yet marked `delivered`
 *
 * @param inventory - Current inventory records with on-hand and cost
 * @param orders - Distributor/purchase orders with totals and status
 * @param options - Optional: `asOf` date for snapshot, `year` for YTD spend
 * @returns BalanceSheetSummary with inventory and spend breakdowns
 */
export const calculateBalanceSheet = (
  inventory: Inventory[],
  orders: DistributorOrder[],
  options?: { asOf?: Date; year?: number }
): BalanceSheetSummary => {
  const asOf = options?.asOf ?? new Date()
  const inventorySummary = summariseInventory(inventory)

  const allTimeSpend = summariseSpend(orders)

  let spendYTD: InventorySpendSummary | undefined
  if (options?.year) {
    const year = options.year
    const filter = (order: DistributorOrder) =>
      !!order.orderDate && order.orderDate.getFullYear() === year
    spendYTD = { ...summariseSpend(orders, filter), year }
  }

  const outstandingOrdersValue = orders
    .filter((order) => order.status !== 'delivered')
    .reduce((sum, order) => sum + order.total, 0)

  return {
    asOf,
    inventory: inventorySummary,
    spendAllTime: allTimeSpend,
    spendYTD,
    outstandingOrdersValue,
  }
}
