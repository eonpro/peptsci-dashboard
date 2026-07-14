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

/** All sales records, newest first. */
export async function getSales(): Promise<Sale[]> {
  if (!prisma) return []
  try {
    const rows = await prisma.salesRecord.findMany({
      orderBy: { date: 'desc' },
    })
    return rows.map((r) => toSale(r as unknown as SalesRecordRow))
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
      invoicePaid: order.paymentStatus === 'CAPTURED',
      paidAmount,
      vials,
      amountPerVial: vials > 0 ? paidAmount / vials : 0,
      product: productLabel,
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
