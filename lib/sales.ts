/**
 * Sales analytics, sourced from Postgres (SalesRecord). Replaces the former
 * Google Sheets "Sales" tab. The `Sale` shape is preserved so dashboard,
 * customers, profit & loss, and search keep working unchanged.
 *
 * SalesRecord is populated by three writers (see schema.prisma):
 *   - Platform orders  -> syncSalesRecordFromOrder() (real COGS)
 *   - Stripe backfill   -> /api/admin/sales/backfill-stripe
 *   - CSV upload        -> /api/admin/sales/import
 */

import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { logger } from './logger'

export interface Sale {
  Date: Date | null
  OrderID: string
  CustomerName: string
  CustomerEmail: string
  CustomerPhone: string
  Address: string
  City: string
  State: string
  Zip: string
  TrackingNumber: string
  InvoicePaid: boolean
  PaidAmount: number
  Vials: number
  AmountPerVial: number
  Product: string
  Notes: string
  COGS: number
  Profit: number
  ProfitMargin: number
  Markup: number
  /** Linked Order.status when the SalesRecord has an orderId (ops badges / filters). */
  OrderStatus?: string | null
}

type SalesRecordRow = {
  date: Date | null
  orderRef: string
  customerName: string
  customerEmail: string
  customerPhone: string
  address: string
  city: string
  state: string
  zip: string
  trackingNumber: string
  invoicePaid: boolean
  paidAmount: unknown
  vials: number
  amountPerVial: unknown
  product: string
  lineItems?: unknown
  notes: string
  unitCost: unknown
  cogs: unknown
}

/** Map a stored SalesRecord row into the `Sale` shape consumers expect. */
function toSale(r: SalesRecordRow): Sale {
  const paidAmount = Number(r.paidAmount)
  const cogs = Number(r.cogs)
  const profit = paidAmount - cogs
  return {
    Date: r.date,
    OrderID: r.orderRef,
    CustomerName: r.customerName,
    CustomerEmail: r.customerEmail,
    CustomerPhone: r.customerPhone,
    Address: r.address,
    City: r.city,
    State: r.state,
    Zip: r.zip,
    TrackingNumber: r.trackingNumber,
    InvoicePaid: r.invoicePaid,
    PaidAmount: paidAmount,
    Vials: r.vials,
    AmountPerVial: Number(r.amountPerVial),
    Product: r.product,
    Notes: r.notes,
    COGS: cogs,
    Profit: profit,
    ProfitMargin: paidAmount > 0 ? (profit / paidAmount) * 100 : 0,
    Markup: cogs > 0 ? (profit / cogs) * 100 : 0,
  }
}

/** Shape of one entry in SalesRecord.lineItems (validated at read time). */
interface StoredLineItem {
  product: string
  quantity: number
  amount: number
  cogs: number
}

function parseLineItems(raw: unknown): StoredLineItem[] {
  if (!Array.isArray(raw)) return []
  const out: StoredLineItem[] = []
  for (const entry of raw) {
    const li = entry as Record<string, unknown>
    const product = typeof li?.product === 'string' ? li.product.trim() : ''
    if (!product) continue
    out.push({
      product,
      quantity: typeof li.quantity === 'number' && li.quantity > 0 ? li.quantity : 0,
      amount: typeof li.amount === 'number' ? li.amount : 0,
      cogs: typeof li.cogs === 'number' ? li.cogs : 0,
    })
  }
  return out
}

/**
 * Group Recent Orders by order number so two same-day orders for one practice
 * do not render as a single expanded row with mixed unit prices.
 */
export function recentOrderGroupKey(
  sale: Pick<Sale, 'OrderID' | 'CustomerName' | 'Date'>
): string | null {
  if (!sale.Date) return null
  if (sale.OrderID) return `order_${sale.OrderID}`
  const dateObj = sale.Date instanceof Date ? sale.Date : new Date(sale.Date)
  const dateKey = Number.isNaN(dateObj.getTime()) ? '' : dateObj.toISOString().split('T')[0]
  return `customer_${sale.CustomerName}_${dateKey}`
}

/**
 * Map a SalesRecord row into one or more `Sale` rows: multi-item orders with a
 * stored per-line breakdown become one Sale PER PRODUCT (so "Tirzepatide 60mg
 * +1 more" credits Tirzepatide 60mg AND the other product separately), while
 * everything else stays a single row. Product lines keep their unit prices;
 * shipping captured on the order total (not on product lines) is emitted as
 * its own row. Invoice-level discounts still scale lines down to paidAmount.
 */
export function salesFromRecord(r: SalesRecordRow): Sale[] {
  const base = toSale(r)
  const lines = parseLineItems(r.lineItems)
  if (lines.length === 0) return [base]

  const lineAmountSum = lines.reduce((s, li) => s + li.amount, 0)
  const lineCogsSum = lines.reduce((s, li) => s + li.cogs, 0)
  const surplus = base.PaidAmount - lineAmountSum
  // Shipping/fees live on Order.total but not on product lines. Do not smear
  // that surplus into per-vial prices (that made $70 NAD+ look like $73.75).
  // Invoice-level discounts (paidAmount < line sum) still scale down below.
  const working: StoredLineItem[] =
    lineAmountSum > 0 && surplus > 0.005
      ? [
          ...lines,
          {
            product: 'Shipping',
            quantity: 0,
            amount: surplus,
            cogs: Math.max(0, base.COGS - lineCogsSum),
          },
        ]
      : lines

  // Single product line that already matches the captured total: keep totals,
  // prefer the dose-qualified line product name.
  if (working.length === 1) {
    return [{ ...base, Product: working[0].product || base.Product }]
  }

  const workingAmountSum = working.reduce((s, li) => s + li.amount, 0)
  const workingCogsSum = working.reduce((s, li) => s + li.cogs, 0)
  // Invoice-level discounts/adjustments mean line sums can differ from the
  // captured total; scale proportionally so the record's totals are preserved.
  const amountFactor = workingAmountSum > 0 ? base.PaidAmount / workingAmountSum : 0
  if (workingAmountSum <= 0 && base.PaidAmount > 0) return [base]

  return working.map((li) => {
    const paidAmount = li.amount * amountFactor
    const cogs =
      workingCogsSum > 0
        ? (li.cogs / workingCogsSum) * base.COGS
        : workingAmountSum > 0
          ? (li.amount / workingAmountSum) * base.COGS
          : 0
    const profit = paidAmount - cogs
    return {
      ...base,
      Product: li.product,
      PaidAmount: paidAmount,
      Vials: li.quantity,
      AmountPerVial: li.quantity > 0 ? paidAmount / li.quantity : 0,
      COGS: cogs,
      Profit: profit,
      ProfitMargin: paidAmount > 0 ? (profit / paidAmount) * 100 : 0,
      Markup: cogs > 0 ? (profit / cogs) * 100 : 0,
    }
  })
}

/** All sales records, newest first. Multi-item orders yield one row per product. */
export async function getSales(): Promise<Sale[]> {
  if (!prisma) return []
  try {
    const rows = await prisma.salesRecord.findMany({
      orderBy: { date: 'desc' },
    })
    // Attach live Order.status so the dashboard can hide cancelled rows from
    // the Recent Orders ops queue (SalesRecord alone has no status column).
    const orderIds = [
      ...new Set(rows.map((r) => r.orderId).filter((id): id is string => Boolean(id))),
    ]
    const statusByOrderId = new Map<string, string>()
    if (orderIds.length > 0) {
      const orders = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, status: true },
      })
      for (const o of orders) statusByOrderId.set(o.id, o.status)
    }
    return rows.flatMap((r) => {
      const sales = salesFromRecord(r as unknown as SalesRecordRow)
      const status = r.orderId ? statusByOrderId.get(r.orderId) : undefined
      if (!status) return sales
      return sales.map((s) => ({ ...s, OrderStatus: status }))
    })
  } catch (error) {
    logger.error(
      'Error fetching sales',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return []
  }
}

/**
 * Build a product-name -> unit cost lookup from the catalog, used to estimate
 * COGS for CSV/Stripe rows that don't carry a cost. Mirrors the old Sheets
 * matching (exact, normalized, and first-token partial match).
 */
export async function buildCostLookup(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!prisma) return map
  try {
    const variants = await prisma.productVariant.findMany({
      select: { dose: true, unitCost: true, product: { select: { name: true } } },
    })
    for (const v of variants) {
      const cost = Number(v.unitCost)
      const base = v.product.name.toLowerCase().trim()
      const withDose = `${base} ${v.dose ?? ''}`.toLowerCase().trim()
      const normalized = base.replace(/\s+/g, '').replace(/[^\w]/g, '')
      map.set(base, cost)
      map.set(withDose, cost)
      map.set(normalized, cost)
    }
  } catch {
    // best-effort
  }
  return map
}

/**
 * Estimate the per-unit cost for a product name using a prebuilt lookup,
 * falling back to 35% of the selling price (same heuristic the Sheets layer
 * used) when no catalog match is found.
 */
export function estimateUnitCost(
  product: string,
  amountPerVial: number,
  costLookup: Map<string, number>
): number {
  const lower = product.toLowerCase().trim()
  const normalized = lower.replace(/\s+/g, '').replace(/[^\w]/g, '')
  if (costLookup.has(lower)) return costLookup.get(lower)!
  if (costLookup.has(normalized)) return costLookup.get(normalized)!
  const firstToken = lower.split(' ')[0]
  for (const [key, cost] of costLookup.entries()) {
    if (lower.includes(key) || (firstToken && key.includes(firstToken))) return cost
  }
  return amountPerVial * 0.35
}

function addressString(json: unknown): { line: string; city: string; state: string; zip: string } {
  const a = (json ?? {}) as Record<string, unknown>
  const line = [a.address1, a.address2].filter(Boolean).join(', ')
  return {
    line: typeof a.address1 === 'string' ? a.address1 : line,
    city: typeof a.city === 'string' ? a.city : '',
    state: typeof a.state === 'string' ? a.state : '',
    zip: typeof a.zip === 'string' ? a.zip : '',
  }
}

/**
 * Upsert a SalesRecord from a captured platform Order. Keyed by orderId so it
 * is idempotent (safe from both the confirm endpoint and the webhook). COGS is
 * real: summed from each line's variant unit cost.
 */
export async function syncSalesRecordFromOrder(orderId: string): Promise<void> {
  if (!prisma) return
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: true,
        items: { include: { variant: { include: { product: true } } } },
        _count: { select: { invoiceLineItems: { where: { invoice: { status: { not: 'VOID' } } } } } },
      },
    })
    if (!order) return

    // A record created by the Stripe ingest (stripe-convert / backfill) holds
    // the TRUE captured amount from Stripe. Overwriting it with catalog line
    // totals (source: 'order') would silently shift reported revenue, so
    // Stripe-sourced records are owned by the Stripe reconcile path.
    const existing = await prisma.salesRecord.findUnique({
      where: { orderId },
      select: { id: true, source: true },
    })
    if (existing && existing.source === 'stripe') {
      logger.info('Skipping sales sync: record is Stripe-sourced', { orderId })
      return
    }

    const vials = order.items.reduce((sum, it) => sum + it.quantity, 0)
    const grossCogs = order.items.reduce(
      (sum, it) => sum + Number(it.variant.unitCost) * it.quantity,
      0
    )
    // Net of refunds: paidAmount is what we actually kept; COGS is scaled by
    // the same fraction (mirrors the refund-aware external Stripe ingest) so
    // margins stay consistent. Recomputed from current order state, idempotent.
    const grossTotal = Number(order.total)
    const refunded = Math.min(Number(order.refundedTotal ?? 0), grossTotal)
    const paidAmount = Math.max(0, grossTotal - refunded)
    const paidFraction = grossTotal > 0 ? paidAmount / grossTotal : 0
    const cogs = grossCogs * paidFraction
    const productLabel =
      order.items.length === 0
        ? ''
        : order.items.length === 1
          ? order.items[0].variant.product.name
          : `${order.items[0].variant.product.name} +${order.items.length - 1} more`
    // Per-line breakdown (net of refunds, same scaling as the totals) so
    // analytics credits each real product instead of the "+N more" label.
    // Include shipping as its own line so product unit prices stay catalog/
    // client prices instead of (subtotal + shipping) / vials.
    const productLines = order.items.map((it) => ({
      product: [it.variant.product.name, it.variant.dose].filter(Boolean).join(' ').trim(),
      quantity: it.quantity,
      amount: Number(it.totalPrice) * paidFraction,
      cogs: Number(it.variant.unitCost) * it.quantity * paidFraction,
    }))
    const shippingAmount = Number(order.shippingTotal) * paidFraction
    const lineItems =
      productLines.length > 0
        ? shippingAmount > 0.005
          ? [...productLines, { product: 'Shipping', quantity: 0, amount: shippingAmount, cogs: 0 }]
          : productLines
        : Prisma.JsonNull
    const addr = addressString(order.shippingAddress ?? order.client.shippingAddress)

    const data = {
      date: order.paidAt ?? order.createdAt,
      orderRef: `#${order.orderNumber}`,
      customerName: order.client.contactName || order.client.organizationName,
      customerEmail: order.client.contactEmail || '',
      customerPhone: order.client.contactPhone || '',
      address: addr.line,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      trackingNumber: order.trackingNumber || '',
      // Captured card payments AND legitimately invoiced (net-terms) orders
      // both count as "billed" — otherwise AR orders show as unpaid revenue.
      invoicePaid: order.paymentStatus === 'CAPTURED' || order._count.invoiceLineItems > 0,
      paidAmount,
      vials,
      amountPerVial: vials > 0 ? paidAmount / vials : 0,
      product: productLabel,
      lineItems,
      notes: order.notes || '',
      unitCost: vials > 0 ? cogs / vials : 0,
      cogs,
      source: 'order',
      stripePaymentIntentId: order.stripePaymentIntentId,
    }

    await prisma.salesRecord.upsert({
      where: { orderId },
      create: { orderId, ...data },
      update: data,
    })
  } catch (error) {
    // Never let analytics syncing break the payment flow.
    logger.warn('Failed to sync SalesRecord from order', {
      orderId,
      error: String(error),
    })
  }
}
