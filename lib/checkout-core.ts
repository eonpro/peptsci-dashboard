/**
 * Pure, dependency-free checkout math + validation.
 *
 * Kept free of Prisma/Stripe imports so totals/shipping/validation logic is
 * unit-testable and shared between the price resolver and any callers.
 *
 * Pricing model (Model A): the server is the source of truth. Callers must
 * NEVER trust client-sent prices — unit prices are resolved server-side from
 * the DB and fed into `computeCartTotals`.
 */

export const MAX_LINE_QUANTITY = 999

// No sales tax. Shipping is tiered by speed and order size.
export const FREE_SHIPPING_THRESHOLD = 500

/** Shipping speed offered at checkout. */
export type ShipSpeed = 'TWO_DAY' | 'OVERNIGHT'

/** Where the order ships. */
export type ShipTo = 'PRACTICE' | 'PATIENT'

/**
 * Shipping price matrix (server-authoritative):
 *   subtotal < $500  → 2-Day $25, Overnight $35
 *   subtotal >= $500 → 2-Day FREE, Overnight $20
 */
export const SHIPPING_RATES: Record<'STANDARD' | 'QUALIFIED', Record<ShipSpeed, number>> = {
  STANDARD: { TWO_DAY: 25, OVERNIGHT: 35 },
  QUALIFIED: { TWO_DAY: 0, OVERNIGHT: 20 },
}

export interface CartLineInput {
  sku: string
  quantity: number
}

export interface ResolvedLine {
  variantId: string
  sku: string
  productName: string
  dose: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  isCustomPrice: boolean
}

export interface CartTotals {
  subtotal: number
  taxTotal: number
  shippingTotal: number
  total: number
}

/** Round to 2 decimal places without floating-point drift. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export class CartValidationError extends Error {
  code: string
  constructor(message: string, code = 'CART_INVALID') {
    super(message)
    this.name = 'CartValidationError'
    this.code = code
  }
}

/**
 * Validate raw cart input. Throws CartValidationError on any problem.
 * Returns a normalized list (skus trimmed, quantities coerced to ints).
 */
export function validateCartInput(items: unknown): CartLineInput[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CartValidationError('Cart is empty', 'CART_EMPTY')
  }

  const seen = new Set<string>()
  return items.map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      throw new CartValidationError(`Invalid cart item at index ${i}`)
    }
    const { sku, quantity } = raw as Record<string, unknown>
    if (typeof sku !== 'string' || sku.trim().length === 0) {
      throw new CartValidationError(`Missing sku at index ${i}`, 'CART_SKU_MISSING')
    }
    const normalizedSku = sku.trim()
    if (seen.has(normalizedSku)) {
      throw new CartValidationError(`Duplicate sku "${normalizedSku}"`, 'CART_DUPLICATE_SKU')
    }
    seen.add(normalizedSku)

    if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
      throw new CartValidationError(`Invalid quantity for "${normalizedSku}"`, 'CART_QTY_INVALID')
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new CartValidationError(
        `Quantity for "${normalizedSku}" must be a positive integer`,
        'CART_QTY_INVALID'
      )
    }
    if (quantity > MAX_LINE_QUANTITY) {
      throw new CartValidationError(
        `Quantity for "${normalizedSku}" exceeds ${MAX_LINE_QUANTITY}`,
        'CART_QTY_TOO_LARGE'
      )
    }

    return { sku: normalizedSku, quantity }
  })
}

export interface StockCheckLine {
  sku: string
  productName: string
  quantity: number
  /** Sellable units: onHand - reserved (can be negative when oversold). */
  available: number
}

/**
 * Lines whose requested quantity exceeds sellable stock. Pure so the oversell
 * gate is unit-testable; callers decide whether shortages hard-block (clinic
 * checkout) or only warn (admin manual orders).
 */
export function findStockShortages(lines: StockCheckLine[]): StockCheckLine[] {
  return lines.filter((l) => l.quantity > Math.max(0, l.available))
}

/** Human-readable summary of stock shortages for error messages. */
export function describeStockShortages(shortages: StockCheckLine[]): string {
  return shortages
    .map(
      (s) =>
        `${s.productName} (${s.sku}): requested ${s.quantity}, ${Math.max(0, s.available)} available`
    )
    .join('; ')
}

/** Does this subtotal qualify for the discounted (free 2-day) shipping tier? */
export function qualifiesForFreeShipping(subtotal: number): boolean {
  return subtotal >= FREE_SHIPPING_THRESHOLD
}

/**
 * Shipping cost for the chosen speed, tiered by order subtotal.
 * Empty/zero carts ship for free.
 */
export function computeShipping(subtotal: number, speed: ShipSpeed = 'TWO_DAY'): number {
  if (subtotal <= 0) return 0
  const tier = qualifiesForFreeShipping(subtotal) ? 'QUALIFIED' : 'STANDARD'
  return SHIPPING_RATES[tier][speed]
}

/**
 * Compute order totals from server-resolved lines. Tax is always 0.
 * Shipping depends on the chosen speed (defaults to 2-day).
 */
export function computeCartTotals(
  lines: Pick<ResolvedLine, 'lineTotal'>[],
  speed: ShipSpeed = 'TWO_DAY'
): CartTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0))
  const taxTotal = 0
  const shippingTotal = computeShipping(subtotal, speed)
  const total = round2(subtotal + taxTotal + shippingTotal)
  return { subtotal, taxTotal, shippingTotal, total }
}
