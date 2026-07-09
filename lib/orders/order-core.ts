/**
 * Pure, dependency-free logic for building an admin-created ("manual") order.
 *
 * Kept free of Prisma/Stripe imports so line validation + price resolution are
 * unit-testable and shared between the manual-order builder and the Stripe →
 * fulfillment conversion. Pricing model (Model A): the server is the source of
 * truth. An admin MAY override a unit price explicitly (e.g. to match what a
 * customer was actually charged on a Stripe invoice); otherwise the effective
 * price is resolved from the catalog SRP + the client's negotiated price.
 */

import { round2, MAX_LINE_QUANTITY, type ResolvedLine } from '../checkout-core'
import { resolveEffectiveUnitPrice } from '../access'

export class ManualOrderError extends Error {
  code: string
  constructor(message: string, code = 'MANUAL_ORDER_INVALID') {
    super(message)
    this.name = 'ManualOrderError'
    this.code = code
  }
}

/** A single requested line: a catalog variant, a quantity, and an optional price override. */
export interface ManualLineInput {
  variantId: string
  quantity: number
  /** Admin price override (per unit). When omitted, catalog/client pricing is used. */
  unitPrice?: number | null
}

/** Catalog + client-pricing facts about a variant, supplied by the DB layer. */
export interface VariantPriceInfo {
  variantId: string
  sku: string | null
  productName: string
  dose: string | null
  srp: number
  /** Active per-client negotiated price, if any. */
  customPrice?: number | null
}

/**
 * Validate raw manual-order line input. Throws {@link ManualOrderError} on any
 * problem. Returns a normalized list (variantIds trimmed, quantities coerced to
 * ints, price overrides rounded). Duplicate variantIds are rejected — callers
 * should merge quantities before submitting.
 */
export function validateManualLines(lines: unknown): ManualLineInput[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ManualOrderError('Order has no line items', 'LINES_EMPTY')
  }

  const seen = new Set<string>()
  return lines.map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      throw new ManualOrderError(`Invalid line item at index ${i}`)
    }
    const { variantId, quantity, unitPrice } = raw as Record<string, unknown>

    if (typeof variantId !== 'string' || variantId.trim().length === 0) {
      throw new ManualOrderError(`Missing product at index ${i}`, 'LINE_VARIANT_MISSING')
    }
    const id = variantId.trim()
    if (seen.has(id)) {
      throw new ManualOrderError(`Duplicate product in order (${id})`, 'LINE_DUPLICATE')
    }
    seen.add(id)

    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      throw new ManualOrderError(`Quantity must be a positive whole number`, 'LINE_QTY_INVALID')
    }
    if (quantity > MAX_LINE_QUANTITY) {
      throw new ManualOrderError(`Quantity exceeds ${MAX_LINE_QUANTITY}`, 'LINE_QTY_TOO_LARGE')
    }

    let override: number | null = null
    if (unitPrice !== undefined && unitPrice !== null && unitPrice !== '') {
      const n = Number(unitPrice)
      if (!Number.isFinite(n) || n < 0) {
        throw new ManualOrderError('Price override must be a non-negative number', 'LINE_PRICE_INVALID')
      }
      override = round2(n)
    }

    return { variantId: id, quantity, unitPrice: override }
  })
}

/**
 * Resolve validated lines into priced {@link ResolvedLine}s using catalog/client
 * pricing (or an explicit admin override). Throws if a variant is not found in
 * `variantInfo` (unknown/inactive product).
 */
export function buildManualOrderLines(
  inputs: ManualLineInput[],
  variantInfo: Map<string, VariantPriceInfo>
): ResolvedLine[] {
  return inputs.map((input) => {
    const info = variantInfo.get(input.variantId)
    if (!info) {
      throw new ManualOrderError(`Product "${input.variantId}" is not available`, 'LINE_VARIANT_UNKNOWN')
    }

    let unitPrice: number
    let isCustomPrice: boolean
    if (input.unitPrice !== undefined && input.unitPrice !== null) {
      unitPrice = round2(input.unitPrice)
      isCustomPrice = true
    } else {
      const resolved = resolveEffectiveUnitPrice({ srp: info.srp, customPrice: info.customPrice ?? null })
      unitPrice = round2(resolved.price)
      isCustomPrice = resolved.isCustom
    }

    return {
      variantId: info.variantId,
      sku: info.sku ?? '',
      productName: info.productName,
      dose: info.dose,
      quantity: input.quantity,
      unitPrice,
      lineTotal: round2(unitPrice * input.quantity),
      isCustomPrice,
    }
  })
}
