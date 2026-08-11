/**
 * Map Stripe SalesRecord.lineItems → catalog convert lines for the
 * Fulfillment "Convert Stripe Payment" modal.
 *
 * Pure + dependency-free so unit tests don't need Prisma.
 */

import type { ShipSpeed } from '../checkout-core'
import { matchVariantIdFromDescription } from '../invoicing/fulfill-products'
import { inferShipSpeedFromText } from '../shopify/ship-speed'

export type StripeSaleLineItem = {
  product: string
  quantity: number
  /** Gross line amount in dollars (qty × unit). */
  amount: number
}

export type StripeConvertCatalogVariant = {
  id: string
  sku: string | null
  productName: string
  dose: string | null
  available: number
}

export type StripeConvertMappedLine = {
  variantId: string
  label: string
  quantity: number
  unitPrice: number
  available: number
  /** Always manual so client custom/at-cost repricing does not overwrite Stripe. */
  priceSource: 'manual'
  stripeProduct: string
}

export type MapStripeLinesResult = {
  lines: StripeConvertMappedLine[]
  unmatched: string[]
  /** Sum of Stripe shipping line amounts (0 when none). */
  shippingTotal: number
  shipSpeed: ShipSpeed
  /** True when a dedicated shipping line was present on the Stripe invoice. */
  hasShippingLine: boolean
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

/** Validate SalesRecord.lineItems JSON into typed rows. */
export function parseStripeSaleLineItems(raw: unknown): StripeSaleLineItem[] {
  if (!Array.isArray(raw)) return []
  const out: StripeSaleLineItem[] = []
  for (const entry of raw) {
    const li = entry as Record<string, unknown>
    const product = typeof li?.product === 'string' ? li.product.trim() : ''
    if (!product) continue
    const quantity =
      typeof li.quantity === 'number' && Number.isFinite(li.quantity) && li.quantity > 0
        ? Math.floor(li.quantity)
        : 0
    const amount = typeof li.amount === 'number' && Number.isFinite(li.amount) ? li.amount : 0
    if (quantity < 1) continue
    out.push({ product, quantity, amount })
  }
  return out
}

/** True when an invoice line is shipping (not a catalog product). */
export function isStripeShippingLineDescription(description: string): boolean {
  const t = description.trim()
  if (!t) return false
  if (/\b(shipping|freight|delivery\s*fee|postage)\b/i.test(t)) return true
  if (/^(2[\s-]?day|overnight|next[\s-]?day)(\s+shipping)?$/i.test(t)) return true
  return false
}

function catalogLabel(v: StripeConvertCatalogVariant): string {
  return `${v.productName}${v.dose ? ` ${v.dose}` : ''}${v.sku ? ` · ${v.sku}` : ''}`
}

/**
 * Preload convert-modal lines from Stripe invoice breakdown.
 * Shipping lines are peeled into shippingTotal; product lines match catalog
 * variants and keep the Stripe unit price (amount / qty).
 */
export function mapStripeSaleLinesToConvert(
  lineItems: readonly StripeSaleLineItem[],
  catalog: readonly StripeConvertCatalogVariant[],
  opts?: { fallbackProduct?: string | null; fallbackVials?: number; paidAmount?: number }
): MapStripeLinesResult {
  const catalogRows = catalog.map((v) => ({
    id: v.id,
    sku: v.sku,
    productName: v.productName,
    dose: v.dose,
  }))
  const byId = new Map(catalog.map((v) => [v.id, v]))

  let shippingTotal = 0
  let hasShippingLine = false
  let shipSpeed: ShipSpeed = 'TWO_DAY'
  const productLines: StripeSaleLineItem[] = []

  for (const li of lineItems) {
    if (isStripeShippingLineDescription(li.product)) {
      hasShippingLine = true
      shippingTotal = roundMoney(shippingTotal + Math.max(0, li.amount))
      if (inferShipSpeedFromText(li.product) === 'OVERNIGHT') shipSpeed = 'OVERNIGHT'
      continue
    }
    productLines.push(li)
  }

  // Infer overnight from any product/shipping text when not already set.
  if (shipSpeed === 'TWO_DAY') {
    const hay = [
      ...lineItems.map((l) => l.product),
      opts?.fallbackProduct ?? '',
    ].join(' ')
    shipSpeed = inferShipSpeedFromText(hay)
  }

  const lines: StripeConvertMappedLine[] = []
  const unmatched: string[] = []
  const used = new Map<string, StripeConvertMappedLine>()

  for (const li of productLines) {
    const variantId = matchVariantIdFromDescription(li.product, catalogRows)
    if (!variantId) {
      unmatched.push(li.product)
      continue
    }
    const v = byId.get(variantId)
    if (!v) {
      unmatched.push(li.product)
      continue
    }
    const unitPrice = roundMoney(li.amount / li.quantity)
    const existing = used.get(variantId)
    if (existing) {
      // Same SKU on multiple Stripe lines — sum qty; keep first unit price.
      existing.quantity += li.quantity
      continue
    }
    const mapped: StripeConvertMappedLine = {
      variantId,
      label: catalogLabel(v),
      quantity: li.quantity,
      unitPrice,
      available: v.available,
      priceSource: 'manual',
      stripeProduct: li.product,
    }
    used.set(variantId, mapped)
    lines.push(mapped)
  }

  // Legacy rows with no lineItems: try the compact product label once.
  if (lines.length === 0 && productLines.length === 0 && opts?.fallbackProduct) {
    const seed = opts.fallbackProduct.replace(/\s*\+\d+\s+more\b/gi, '').trim()
    if (seed && !isStripeShippingLineDescription(seed)) {
      const variantId = matchVariantIdFromDescription(seed, catalogRows)
      const qty = opts.fallbackVials && opts.fallbackVials > 0 ? opts.fallbackVials : 1
      const paid = opts.paidAmount ?? 0
      if (variantId) {
        const v = byId.get(variantId)!
        lines.push({
          variantId,
          label: catalogLabel(v),
          quantity: qty,
          unitPrice: qty > 0 ? roundMoney(Math.max(0, paid) / qty) : 0,
          available: v.available,
          priceSource: 'manual',
          stripeProduct: seed,
        })
      } else if (seed) {
        unmatched.push(seed)
      }
    }
  }

  return { lines, unmatched, shippingTotal, shipSpeed, hasShippingLine }
}
