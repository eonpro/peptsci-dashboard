/**
 * Map Shopify shipping line titles/codes → PeptSci ship speeds.
 * Pure + dependency-free so unit tests don't need Prisma/Shopify.
 */

import type { ShipSpeed } from '@/lib/checkout-core'

export type ShopifyShippingLineLike = {
  title?: string | null
  code?: string | null
}

const OVERNIGHT_RE =
  /\b(over[\s-]?night|next[\s-]?day|1[\s-]?day|priority[\s-]?overnight|express[\s-]?overnight)\b/i

/** Infer ship speed from free-text (Stripe description, invoice memo, etc.). */
export function inferShipSpeedFromText(text: string | null | undefined): ShipSpeed {
  if (!text?.trim()) return 'TWO_DAY'
  return OVERNIGHT_RE.test(text) ? 'OVERNIGHT' : 'TWO_DAY'
}

/**
 * Prefer the first overnight-matching shipping line; otherwise TWO_DAY.
 * Empty / missing lines → TWO_DAY.
 */
export function mapShopifyShipSpeed(
  lines: ShopifyShippingLineLike[] | null | undefined
): ShipSpeed {
  if (!lines?.length) return 'TWO_DAY'
  for (const line of lines) {
    const haystack = `${line.title ?? ''} ${line.code ?? ''}`.trim()
    if (haystack && OVERNIGHT_RE.test(haystack)) return 'OVERNIGHT'
  }
  return 'TWO_DAY'
}
