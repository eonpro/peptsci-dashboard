/**
 * Sold-out / backorder policy for the clinic shop.
 *
 * When sellable stock (onHand − reserved) is 0, clients may still place an
 * order with a higher MOQ and an explicit lead-time warning. In-stock SKUs
 * keep normal stock enforcement (qty ≤ available).
 */

/** Minimum vials required to backorder a zero-stock SKU. */
export const BACKORDER_MIN_QUANTITY = 20

/** Customer-facing fulfillment lead time for backordered lines. */
export const BACKORDER_LEAD_TIME = '2–3 weeks'

/** Short badge / status label shown on catalog + PDP. */
export const BACKORDER_STATUS_LABEL = 'Sold Out'

/** Warning copy for PDP, cart, and checkout surfaces. */
export const BACKORDER_WARNING =
  `This product is sold out. Backorders require a minimum of ${BACKORDER_MIN_QUANTITY} vials and typically take ${BACKORDER_LEAD_TIME} to fulfill.`

/** True when there is no sellable stock (backorder path applies). */
export function isZeroStock(available: number): boolean {
  return Math.max(0, available) === 0
}

/**
 * Validate quantity for a line given sellable stock.
 * Returns an error message, or null when the qty is allowed.
 */
export function validateBackorderQuantity(
  quantity: number,
  available: number
): string | null {
  if (!isZeroStock(available)) return null
  if (!Number.isInteger(quantity) || quantity < BACKORDER_MIN_QUANTITY) {
    return `Sold-out items require a minimum order of ${BACKORDER_MIN_QUANTITY} vials (fulfillment may take ${BACKORDER_LEAD_TIME})`
  }
  return null
}

/** Clamp a quantity for a backorder line into [min, max]. */
export function clampBackorderQuantity(
  quantity: number,
  max = 100
): number {
  const q = Math.floor(quantity)
  if (!Number.isFinite(q)) return BACKORDER_MIN_QUANTITY
  return Math.min(Math.max(BACKORDER_MIN_QUANTITY, q), max)
}
