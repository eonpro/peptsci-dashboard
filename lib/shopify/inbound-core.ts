/**
 * Pure helpers for Shopify inbound → invoice line building (unit-testable).
 */

import { round2, type ShipSpeed } from '@/lib/checkout-core'

export type PricedInboundLine = {
  variantId: string
  description: string
  quantity: number
  unitPrice: number
}

export type ShopifyInvoiceBuildInput = {
  lines: PricedInboundLine[]
  shippingTotal: number
  shipSpeed: ShipSpeed
  shopifyOrderName: string
}

export type ShopifyInvoiceBuildResult = {
  lineItems: Array<{ description: string; quantity: number; unitPrice: number }>
  subtotal: number
  shippingTotal: number
  total: number
}

/** Build invoice manual lines (products + shipping) from priced inbound rows. */
export function buildShopifyInvoiceLines(input: ShopifyInvoiceBuildInput): ShopifyInvoiceBuildResult {
  const lineItems: Array<{ description: string; quantity: number; unitPrice: number }> = []
  let subtotal = 0
  for (const line of input.lines) {
    const unitPrice = round2(line.unitPrice)
    const qty = Math.max(1, Math.floor(line.quantity))
    subtotal = round2(subtotal + unitPrice * qty)
    lineItems.push({
      description: line.description,
      quantity: qty,
      unitPrice,
    })
  }
  const shippingTotal = round2(Math.max(0, input.shippingTotal))
  if (shippingTotal > 0) {
    const speedLabel = input.shipSpeed === 'OVERNIGHT' ? 'Next-day' : '2-day'
    lineItems.push({
      description: `${speedLabel} shipping — ${input.shopifyOrderName}`,
      quantity: 1,
      unitPrice: shippingTotal,
    })
  }
  const total = round2(subtotal + shippingTotal)
  return { lineItems, subtotal, shippingTotal, total }
}

/** True when every inbound line has a PeptSci variantId. */
export function inboundLinesFullyMapped(
  lines: Array<{ variantId: string | null | undefined }>
): boolean {
  return lines.length > 0 && lines.every((l) => Boolean(l.variantId))
}

/**
 * Collapse Shopify lines that mapped to the same PeptSci variant (bundle apps
 * often emit two line items for one SKU). createManualOrder rejects duplicates.
 */
export function mergeMappedInboundLines<T extends { variantId: string | null | undefined; quantity: number }>(
  lines: T[]
): Array<T & { variantId: string }> {
  const map = new Map<string, T & { variantId: string }>()
  for (const line of lines) {
    const variantId = line.variantId?.trim()
    if (!variantId) continue
    const qty = Math.max(0, Math.floor(Number(line.quantity) || 0))
    const existing = map.get(variantId)
    if (!existing) {
      map.set(variantId, { ...line, variantId, quantity: qty })
    } else {
      existing.quantity += qty
    }
  }
  return Array.from(map.values()).filter((l) => l.quantity > 0)
}
