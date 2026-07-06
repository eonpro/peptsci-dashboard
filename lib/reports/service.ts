/**
 * Prisma-backed reporting/BI service. Pulls live data and runs it through the
 * pure aggregators in lib/reports/core.ts. Powers the /reports dashboard, the
 * weekly report email, and the CSV export endpoints.
 *
 * @module lib/reports/service
 */

import { format, subDays } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { prisma } from '../prisma'
import { getSales } from '../sales'
import { computeInvoiceTotals, deriveDueDate } from '../invoicing/core'
import {
  revenueSummary,
  revenueByMonth,
  topProducts,
  arAgingSummary,
  fulfillmentSla,
  forecastNextPeriod,
  lowStockSummary,
  BUSINESS_TIME_ZONE,
  nyDayString,
  type SaleLike,
  type RevenueSummary,
  type ProductRevenue,
  type ArAgingSummary,
  type FulfillmentSla,
} from './core'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

/**
 * UTC instant of America/New_York midnight, `days` NY calendar days before the
 * NY day containing `from`. Keeps trailing-window filters aligned with the NY
 * day/month bucketing used by revenueByMonth and the KPI helpers.
 */
function startOfNyDaysAgo(from: Date, days: number): Date {
  const zonedDay = subDays(toZonedTime(from, BUSINESS_TIME_ZONE), days)
  return fromZonedTime(`${format(zonedDay, 'yyyy-MM-dd')}T00:00:00`, BUSINESS_TIME_ZONE)
}

/** Adapt the analytics `Sale` shape to the pure-core `SaleLike`. */
async function loadSaleLikes(): Promise<SaleLike[]> {
  const sales = await getSales()
  return sales.map((s) => ({
    date: s.Date,
    product: s.Product,
    revenue: s.PaidAmount,
    cogs: s.COGS,
    units: s.Vials,
  }))
}

export interface LowStockItem {
  sku: string | null
  productName: string
  dose: string | null
  onHand: number
  reserved: number
  available: number
  reorderLevel: number
}

async function loadLowStock(): Promise<{ items: LowStockItem[]; all: Array<{ available: number; reorderPoint: number }> }> {
  const variants = await db().productVariant.findMany({
    where: { status: 'ACTIVE' },
    select: {
      sku: true,
      dose: true,
      inventoryOnHand: true,
      inventoryReserved: true,
      reorderLevel: true,
      product: { select: { name: true } },
    },
  })
  const all = variants.map((v) => ({
    available: v.inventoryOnHand - v.inventoryReserved,
    reorderPoint: v.reorderLevel,
  }))
  const items: LowStockItem[] = variants
    .map((v) => ({
      sku: v.sku,
      productName: v.product.name,
      dose: v.dose,
      onHand: v.inventoryOnHand,
      reserved: v.inventoryReserved,
      available: v.inventoryOnHand - v.inventoryReserved,
      reorderLevel: v.reorderLevel,
    }))
    .filter((v) => v.available <= v.reorderLevel)
    .sort((a, b) => a.available - b.available)
  return { items, all }
}

async function loadArRows(): Promise<Array<{ amountDue: number; dueDate: Date }>> {
  const invoices = await db().invoice.findMany({
    where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
    include: { lineItems: true, adjustments: true, payments: true },
  })
  const num = (d: unknown): number => (d == null ? 0 : Number(d))
  return invoices.map((inv) => {
    const totals = computeInvoiceTotals({
      lineItems: inv.lineItems.map((li) => ({
        quantity: li.quantity,
        unitPrice: num(li.unitPrice),
        amount: num(li.amount),
      })),
      adjustments: inv.adjustments.map((a) => ({
        kind: a.kind,
        amount: a.amount == null ? null : num(a.amount),
        percent: a.percent == null ? null : num(a.percent),
      })),
      payments: inv.payments.map((p) => ({ amount: num(p.amount) })),
      balanceForward: num(inv.balanceForward),
    })
    return { amountDue: totals.amountDue, dueDate: inv.dueDate ?? deriveDueDate(inv.issueDate, inv.paymentTermsDays) }
  })
}

async function loadSlaInputs(start: Date, end: Date) {
  const orders = await db().order.findMany({
    where: { status: { not: 'DRAFT' }, createdAt: { gte: start, lte: end } },
    select: { createdAt: true, shippedAt: true },
  })
  return orders.map((o) => ({ createdAt: o.createdAt, shippedAt: o.shippedAt }))
}

export interface ReportsDashboard {
  range: { start: string; end: string; days: number }
  revenue: RevenueSummary
  previousRevenue: RevenueSummary
  monthly: Array<{ month: string; revenue: number; profit: number; units: number }>
  forecastRevenue: number
  topProducts: ProductRevenue[]
  ar: ArAgingSummary
  sla: FulfillmentSla
  lowStock: { summary: { lowCount: number; outCount: number; okCount: number }; items: LowStockItem[] }
}

/** Assemble the full /reports dashboard payload for a trailing-N-day window. */
export async function getReportsDashboard(rangeDays = 30): Promise<ReportsDashboard> {
  // Window boundaries snap to America/New_York day starts so the summary
  // agrees with the NY-month bucketing in revenueByMonth.
  const end = new Date()
  const start = startOfNyDaysAgo(end, rangeDays)
  const prevStart = startOfNyDaysAgo(end, rangeDays * 2)

  const [sales, lowStock, arRows, slaInputs] = await Promise.all([
    loadSaleLikes(),
    loadLowStock(),
    loadArRows(),
    loadSlaInputs(start, end),
  ])

  const monthly = revenueByMonth(sales)
  return {
    range: { start: start.toISOString(), end: end.toISOString(), days: rangeDays },
    revenue: revenueSummary(sales, start, end),
    previousRevenue: revenueSummary(sales, prevStart, start),
    monthly,
    forecastRevenue: forecastNextPeriod(monthly.map((m) => m.revenue)),
    topProducts: topProducts(sales, 10, start, end),
    ar: arAgingSummary(arRows),
    sla: fulfillmentSla(slaInputs),
    lowStock: { summary: lowStockSummary(lowStock.all), items: lowStock.items },
  }
}

export interface WeeklySummary {
  weekStart: string
  weekEnd: string
  revenue: RevenueSummary
  priorRevenue: RevenueSummary
  revenueDeltaPct: number
  ar: ArAgingSummary
  sla: FulfillmentSla
  lowStockCount: number
  outOfStockCount: number
  topProducts: ProductRevenue[]
}

/** Compact summary for the weekly report email (trailing 7 days vs prior 7). */
export async function getWeeklySummary(now: Date = new Date()): Promise<WeeklySummary> {
  const end = now
  const start = startOfNyDaysAgo(end, 7)
  const priorStart = startOfNyDaysAgo(end, 14)

  const [sales, lowStock, arRows, slaInputs] = await Promise.all([
    loadSaleLikes(),
    loadLowStock(),
    loadArRows(),
    loadSlaInputs(start, end),
  ])

  const revenue = revenueSummary(sales, start, end)
  const priorRevenue = revenueSummary(sales, priorStart, start)
  const summary = lowStockSummary(lowStock.all)
  return {
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    revenue,
    priorRevenue,
    revenueDeltaPct:
      priorRevenue.revenue > 0
        ? Math.round(((revenue.revenue - priorRevenue.revenue) / priorRevenue.revenue) * 1000) / 10
        : 0,
    ar: arAgingSummary(arRows),
    sla: fulfillmentSla(slaInputs),
    lowStockCount: summary.lowCount,
    outOfStockCount: summary.outCount,
    topProducts: topProducts(sales, 5, start, end),
  }
}

// ── CSV export builders (Excel-compatible, no extra deps) ──

function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v)
  // Neutralize spreadsheet formula execution (CSV injection): prefix cells
  // starting with = + - @ or tab/CR with a quote. Plain numbers (e.g. a
  // negative profit "-5.00") are left intact so numeric columns still parse.
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) {
    s = `'${s}`
  }
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvCell).join(',')]
  for (const r of rows) lines.push(r.map(csvCell).join(','))
  return lines.join('\r\n')
}

export async function buildSalesCsv(): Promise<string> {
  const sales = await getSales()
  return toCsv(
    ['Date', 'Order', 'Customer', 'Product', 'Units', 'Revenue', 'COGS', 'Profit', 'MarginPct'],
    sales.map((s) => [
      s.Date ? nyDayString(s.Date) : '',
      s.OrderID,
      s.CustomerName,
      s.Product,
      s.Vials,
      s.PaidAmount.toFixed(2),
      s.COGS.toFixed(2),
      s.Profit.toFixed(2),
      s.ProfitMargin.toFixed(1),
    ])
  )
}

export async function buildInventoryCsv(): Promise<string> {
  const variants = await db().productVariant.findMany({
    where: { status: 'ACTIVE' },
    select: {
      sku: true,
      dose: true,
      inventoryOnHand: true,
      inventoryReserved: true,
      reorderLevel: true,
      product: { select: { name: true } },
    },
    orderBy: { product: { name: 'asc' } },
  })
  return toCsv(
    ['SKU', 'Product', 'Dose', 'OnHand', 'Reserved', 'Available', 'ReorderLevel', 'Status'],
    variants.map((v) => {
      const available = v.inventoryOnHand - v.inventoryReserved
      return [
        v.sku ?? '',
        v.product.name,
        v.dose ?? '',
        v.inventoryOnHand,
        v.inventoryReserved,
        available,
        v.reorderLevel,
        available <= 0 ? 'OUT' : available <= v.reorderLevel ? 'LOW' : 'OK',
      ]
    })
  )
}

export async function buildArAgingCsv(): Promise<string> {
  const invoices = await db().invoice.findMany({
    where: { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
    include: {
      lineItems: true,
      adjustments: true,
      payments: true,
      client: { select: { organizationName: true } },
    },
    orderBy: { dueDate: 'asc' },
  })
  const num = (d: unknown): number => (d == null ? 0 : Number(d))
  const now = new Date()
  const DAY = 1000 * 60 * 60 * 24
  return toCsv(
    ['Invoice', 'Client', 'IssueDate', 'DueDate', 'DaysPastDue', 'GrossTotal', 'AmountDue', 'Status'],
    invoices.map((inv) => {
      const totals = computeInvoiceTotals({
        lineItems: inv.lineItems.map((li) => ({
          quantity: li.quantity,
          unitPrice: num(li.unitPrice),
          amount: num(li.amount),
        })),
        adjustments: inv.adjustments.map((a) => ({
          kind: a.kind,
          amount: a.amount == null ? null : num(a.amount),
          percent: a.percent == null ? null : num(a.percent),
        })),
        payments: inv.payments.map((p) => ({ amount: num(p.amount) })),
        balanceForward: num(inv.balanceForward),
      })
      const due = inv.dueDate ?? deriveDueDate(inv.issueDate, inv.paymentTermsDays)
      const dpd = Math.floor((now.getTime() - due.getTime()) / DAY)
      return [
        `INV-${String(inv.invoiceNumber).padStart(5, '0')}`,
        inv.client?.organizationName ?? '',
        inv.issueDate.toISOString().slice(0, 10),
        due.toISOString().slice(0, 10),
        dpd > 0 ? dpd : 0,
        totals.grossTotal.toFixed(2),
        totals.amountDue.toFixed(2),
        inv.status,
      ]
    })
  )
}
