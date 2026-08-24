/**
 * Plans the three sellable BAC-water variants against whatever is already in
 * the catalog: 3 mL $5, 10 mL $10, Hospira 30 mL $20.
 *
 * Server-only — it carries wholesale unit costs, so never import this from a
 * client component. `lib/shop/bac-water.ts` holds the presentation rules that
 * the storefront needs.
 *
 * Matching is by SKU, then by mL dose, then (30 mL only) by the leftover
 * `BAC-H20` / 0mg row. A matched variant keeps its existing SKU so order
 * history and COAs stay attached; only dose and pricing move.
 */

import { BAC_WATER_SIZES, isLegacyBacWaterThirtyMl, type BacWaterSize } from './bac-water'

/** Wholesale cost per vial, keyed by the canonical dose label. */
export const BAC_WATER_UNIT_COST: Record<string, number> = {
  '3mL': 1.5,
  '10mL': 3,
  '30mL': 6,
}

/** Units stocked when a size is created for the first time. */
export const BAC_WATER_STARTING_INVENTORY = 50

export interface BacWaterVariantRecord {
  id: string
  sku: string | null
  dose: string | null
}

export interface BacWaterVariantPlanStep {
  action: 'update' | 'create'
  /** Present only when `action` is 'update'. */
  variantId?: string
  /** SKU after the plan runs — the existing one on update, canonical on create. */
  sku: string
  fromSku?: string | null
  fromDose?: string | null
  dose: string
  srp: number
  unitCost: number
  supplierName: string | null
  presentation: BacWaterSize['presentation']
}

/**
 * One step per sellable size, in catalog order (3 mL, 10 mL, 30 mL). Each live
 * variant is claimed at most once, so a single `BAC-H20` row becomes the 30 mL
 * update and the other two sizes are creates.
 */
export function planBacWaterVariants(
  existing: BacWaterVariantRecord[]
): BacWaterVariantPlanStep[] {
  const claimed = new Set<string>()

  return BAC_WATER_SIZES.map((size) => {
    const free = (v: BacWaterVariantRecord) => !claimed.has(v.id)
    const match =
      existing.find((v) => free(v) && (v.sku || '').toLowerCase() === size.sku.toLowerCase()) ||
      existing.find(
        (v) =>
          free(v) && (v.dose || '').replace(/\s+/g, '').toLowerCase() === size.dose.toLowerCase()
      ) ||
      (size.dose === '30mL'
        ? existing.find((v) => free(v) && isLegacyBacWaterThirtyMl(v.sku, v.dose))
        : undefined)

    const shared = {
      dose: size.dose,
      srp: size.listPrice,
      unitCost: BAC_WATER_UNIT_COST[size.dose] ?? 0,
      supplierName: size.presentation === 'hospira' ? 'Hospira' : null,
      presentation: size.presentation,
    }

    if (!match) {
      return { action: 'create' as const, sku: size.sku, ...shared }
    }

    claimed.add(match.id)
    return {
      action: 'update' as const,
      variantId: match.id,
      sku: match.sku || size.sku,
      fromSku: match.sku,
      fromDose: match.dose,
      ...shared,
    }
  })
}
