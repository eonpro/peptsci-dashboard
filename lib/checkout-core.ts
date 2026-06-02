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

// No sales tax. Shipping is free over the threshold, otherwise a flat rate.
export const FREE_SHIPPING_THRESHOLD = 500
export const FLAT_SHIPPING_RATE = 25

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

/** Shipping: free at/above threshold, flat rate below, zero for an empty cart. */
export function computeShipping(subtotal: number): number {
  if (subtotal <= 0) return 0
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_RATE
}

/** Compute order totals from server-resolved lines. Tax is always 0. */
export function computeCartTotals(lines: Pick<ResolvedLine, 'lineTotal'>[]): CartTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0))
  const taxTotal = 0
  const shippingTotal = computeShipping(subtotal)
  const total = round2(subtotal + taxTotal + shippingTotal)
  return { subtotal, taxTotal, shippingTotal, total }
}
