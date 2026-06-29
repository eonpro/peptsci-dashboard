/**
 * Pure, dependency-free reporting/BI aggregation. Operates on plain inputs so
 * it is unit-tested in isolation (mirrors lib/invoicing/core.ts). The
 * Prisma-backed service in lib/reports/service.ts feeds it live rows.
 *
 * @module lib/reports/core
 */

export interface SaleLike {
  date: Date | null
  product: string
  revenue: number
  cogs: number
  units: number
}

export interface RevenueSummary {
  revenue: number
  cogs: number
  profit: number
  marginPct: number
  units: number
  orders: number
}

export interface ProductRevenue {
  product: string
  revenue: number
  profit: number
  units: number
  orders: number
}

export type AgingBucketKey = 'current' | 'net30' | 'net60' | 'net90' | 'over90'

export interface ArAgingSummary {
  current: number
  net30: number
  net60: number
  net90: number
  over90: number
  total: number
  invoiceCount: number
  overdueCount: number
}

export interface SlaInput {
  createdAt: Date
  shippedAt: Date | null
}

export interface FulfillmentSla {
  totalOrders: number
  shippedOrders: number
  unshippedOrders: number
  avgHoursToShip: number
  medianHoursToShip: number
  withinSlaPct: number
  slaHours: number
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function inRange(d: Date | null, start?: Date, end?: Date): boolean {
  if (!d) return false
  if (start && d.getTime() < start.getTime()) return false
  if (end && d.getTime() > end.getTime()) return false
  return true
}

export function revenueSummary(sales: SaleLike[], start?: Date, end?: Date): RevenueSummary {
  let revenue = 0
  let cogs = 0
  let units = 0
  let orders = 0
  for (const s of sales) {
    if ((start || end) && !inRange(s.date, start, end)) continue
    revenue += s.revenue
    cogs += s.cogs
    units += s.units
    orders += 1
  }
  const profit = revenue - cogs
  return {
    revenue: round2(revenue),
    cogs: round2(cogs),
    profit: round2(profit),
    marginPct: revenue > 0 ? round2((profit / revenue) * 100) : 0,
    units,
    orders,
  }
}

/** `YYYY-MM` revenue/profit series, ascending. */
export function revenueByMonth(
  sales: SaleLike[]
): Array<{ month: string; revenue: number; profit: number; units: number }> {
  const map = new Map<string, { revenue: number; profit: number; units: number }>()
  for (const s of sales) {
    if (!s.date) continue
    const key = `${s.date.getUTCFullYear()}-${String(s.date.getUTCMonth() + 1).padStart(2, '0')}`
    const cur = map.get(key) ?? { revenue: 0, profit: 0, units: 0 }
    cur.revenue += s.revenue
    cur.profit += s.revenue - s.cogs
    cur.units += s.units
    map.set(key, cur)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      month,
      revenue: round2(v.revenue),
      profit: round2(v.profit),
      units: v.units,
    }))
}

export function topProducts(sales: SaleLike[], limit = 10, start?: Date, end?: Date): ProductRevenue[] {
  const map = new Map<string, ProductRevenue>()
  for (const s of sales) {
    if ((start || end) && !inRange(s.date, start, end)) continue
    const name = s.product || '(unknown)'
    const cur = map.get(name) ?? { product: name, revenue: 0, profit: 0, units: 0, orders: 0 }
    cur.revenue += s.revenue
    cur.profit += s.revenue - s.cogs
    cur.units += s.units
    cur.orders += 1
    map.set(name, cur)
  }
  return [...map.values()]
    .map((p) => ({ ...p, revenue: round2(p.revenue), profit: round2(p.profit) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, Math.max(0, limit))
}

/** Bucket open invoice balances by how far past due they are. */
export function arAgingSummary(
  invoices: Array<{ amountDue: number; dueDate: Date }>,
  now: Date = new Date()
): ArAgingSummary {
  const out: ArAgingSummary = {
    current: 0,
    net30: 0,
    net60: 0,
    net90: 0,
    over90: 0,
    total: 0,
    invoiceCount: 0,
    overdueCount: 0,
  }
  const DAY = 1000 * 60 * 60 * 24
  for (const inv of invoices) {
    if (!(inv.amountDue > 0)) continue
    out.invoiceCount += 1
    out.total += inv.amountDue
    const diff = Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY)
    if (diff <= 0) out.current += inv.amountDue
    else {
      out.overdueCount += 1
      if (diff <= 30) out.net30 += inv.amountDue
      else if (diff <= 60) out.net60 += inv.amountDue
      else if (diff <= 90) out.net90 += inv.amountDue
      else out.over90 += inv.amountDue
    }
  }
  for (const k of ['current', 'net30', 'net60', 'net90', 'over90', 'total'] as const) {
    out[k] = round2(out[k])
  }
  return out
}

/** Order fulfillment SLA: time from created → shipped, vs an SLA threshold. */
export function fulfillmentSla(orders: SlaInput[], slaHours = 48): FulfillmentSla {
  const HR = 1000 * 60 * 60
  const hours: number[] = []
  let shipped = 0
  for (const o of orders) {
    if (o.shippedAt) {
      shipped += 1
      hours.push((o.shippedAt.getTime() - o.createdAt.getTime()) / HR)
    }
  }
  const sorted = [...hours].sort((a, b) => a - b)
  const avg = hours.length ? hours.reduce((s, h) => s + h, 0) / hours.length : 0
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : 0
  const withinSla = hours.filter((h) => h <= slaHours).length
  return {
    totalOrders: orders.length,
    shippedOrders: shipped,
    unshippedOrders: orders.length - shipped,
    avgHoursToShip: round2(avg),
    medianHoursToShip: round2(median),
    withinSlaPct: shipped > 0 ? round2((withinSla / shipped) * 100) : 0,
    slaHours,
  }
}

/**
 * Forecast the next period from a numeric series using a short simple moving
 * average blended with the linear trend of the last window. Returns 0 for an
 * empty series. Deterministic and pure.
 */
export function forecastNextPeriod(series: number[], window = 3): number {
  const xs = series.filter((n) => Number.isFinite(n))
  if (xs.length === 0) return 0
  if (xs.length === 1) return round2(xs[0])

  const w = Math.min(window, xs.length)
  const recent = xs.slice(-w)
  const sma = recent.reduce((s, n) => s + n, 0) / w

  // Linear regression slope over the recent window (x = 0..w-1).
  const n = recent.length
  const sumX = (n * (n - 1)) / 2
  const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6
  const sumY = recent.reduce((s, y) => s + y, 0)
  const sumXY = recent.reduce((s, y, i) => s + i * y, 0)
  const denom = n * sumX2 - sumX * sumX
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0
  const intercept = (sumY - slope * sumX) / n
  const trendNext = intercept + slope * n

  // Blend (mean reverts wild trends), then floor at 0.
  return round2(Math.max(0, (sma + trendNext) / 2))
}

export function lowStockSummary(
  items: Array<{ available: number; reorderPoint: number }>
): { lowCount: number; outCount: number; okCount: number } {
  let low = 0
  let out = 0
  let ok = 0
  for (const it of items) {
    if (it.available <= 0) out += 1
    else if (it.available <= it.reorderPoint) low += 1
    else ok += 1
  }
  return { lowCount: low, outCount: out, okCount: ok }
}
