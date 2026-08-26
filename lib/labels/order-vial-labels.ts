/**
 * Which order lines get a PeptSci vial label.
 *
 * 3 mL / 10 mL BAC water print a volume-only PeptSci label even when the
 * variant has no inventory batch yet (new sizes start with on-hand only).
 * The Hospira 30 mL bottle is already branded — skip it, and do not treat
 * that skip as a shortfall.
 */

import {
  bacWaterLabelVolume,
  usesHospiraBacPhoto,
  usesPeptSciBacLabel,
} from '@/lib/shop/bac-water'

export interface OrderVialLabelLineInput {
  name: string
  dose?: string | null
  sku?: string | null
  needed: number
  drawnQty: number
}

export interface OrderVialLabelLinePlan {
  /** Hospira 30 mL — no PeptSci label and no shortfall warning. */
  skip: boolean
  /** Print labels from allocatable batch draws. */
  useBatchDraws: boolean
  /** Extra 3 mL / 10 mL labels when batches do not cover the ordered qty. */
  syntheticBacQty: number
  volume: string | null
}

export function planOrderVialLabelLine(input: OrderVialLabelLineInput): OrderVialLabelLinePlan {
  const needed = Math.max(0, Math.trunc(input.needed) || 0)
  const drawnQty = Math.max(0, Math.trunc(input.drawnQty) || 0)

  if (usesHospiraBacPhoto(input.name, input.dose, input.sku)) {
    return { skip: true, useBatchDraws: false, syntheticBacQty: 0, volume: null }
  }

  if (usesPeptSciBacLabel(input.name, input.dose, input.sku)) {
    const volume = bacWaterLabelVolume(input.name, input.dose, input.sku)
    return {
      skip: false,
      useBatchDraws: drawnQty > 0,
      syntheticBacQty: Math.max(0, needed - drawnQty),
      volume,
    }
  }

  return { skip: false, useBatchDraws: true, syntheticBacQty: 0, volume: null }
}
