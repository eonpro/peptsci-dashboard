/**
 * Pure, dependency-free pick-list logic for warehouse pick/pack ops.
 *
 * Builds a FIFO (oldest-BUD-first) pick plan for an order: for each line it
 * lists exactly which batches to pull and how many vials from each, flagging any
 * shortfall. Holds NO Prisma/Clerk imports so it is unit-testable in isolation
 * (mirrors lib/inventory-batches-core.ts / lib/returns/core.ts). The DB-bound
 * service in lib/fulfillment/service.ts feeds it real rows.
 *
 * @module lib/fulfillment/pick-list-core
 */

/** An order line that needs picking. */
export interface PickListItemInput {
  variantId: string
  productName: string
  dose?: string | null
  sku?: string | null
  quantity: number
}

/** A batch available to satisfy a line (subset of inventory batch fields). */
export interface PickableBatch {
  batchNumber: string
  /** Beyond-Use Date; used to sort oldest-first. */
  bud: Date
  qtyOnHand: number
}

/** One batch draw within a pick line. */
export interface PickDraw {
  batchNumber: string
  /** BUD as YYYY-MM-DD for display. */
  bud: string
  qty: number
}

/** A fully planned pick line. */
export interface PickListLine {
  variantId: string
  productName: string
  dose: string
  sku: string
  quantityNeeded: number
  draws: PickDraw[]
  /** Units that could not be allocated from on-hand batches. */
  shortfall: number
}

export interface PickList {
  lines: PickListLine[]
  totalUnits: number
  totalShortfall: number
  /** True when every line is fully satisfiable from on-hand stock. */
  fullyAllocatable: boolean
}

function toIsoDay(d: Date): string {
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * Plan FIFO draws for a single line. Oldest BUD first, ties broken by batch
 * number. Pure; does not mutate inputs. Mirrors planAllocation in
 * inventory-batches-core but carries the BUD through for the printed pick list.
 */
export function planLineDraws(
  batches: PickableBatch[],
  quantity: number
): { draws: PickDraw[]; shortfall: number } {
  const sorted = [...batches]
    .filter((b) => b.qtyOnHand > 0)
    .sort((a, b) => a.bud.getTime() - b.bud.getTime() || a.batchNumber.localeCompare(b.batchNumber))

  const draws: PickDraw[] = []
  let remaining = Math.max(0, Math.trunc(quantity))
  for (const b of sorted) {
    if (remaining <= 0) break
    const take = Math.min(b.qtyOnHand, remaining)
    if (take > 0) {
      draws.push({ batchNumber: b.batchNumber, bud: toIsoDay(b.bud), qty: take })
      remaining -= take
    }
  }
  return { draws, shortfall: remaining }
}

/**
 * Build a complete pick list. `batchesByVariant` maps variantId → its on-hand
 * batches; missing entries simply yield a full shortfall for that line. Lines
 * are aggregated by variant first so the same variant appearing twice on an
 * order is picked once.
 */
export function buildPickList(
  items: PickListItemInput[],
  batchesByVariant: Map<string, PickableBatch[]>
): PickList {
  const aggregated = new Map<string, PickListItemInput>()
  for (const item of items) {
    const qty = Math.max(0, Math.trunc(item.quantity))
    if (qty <= 0 || !item.variantId) continue
    const existing = aggregated.get(item.variantId)
    if (existing) {
      existing.quantity += qty
    } else {
      aggregated.set(item.variantId, { ...item, quantity: qty })
    }
  }

  const lines: PickListLine[] = []
  let totalUnits = 0
  let totalShortfall = 0

  for (const item of aggregated.values()) {
    const batches = batchesByVariant.get(item.variantId) ?? []
    const { draws, shortfall } = planLineDraws(batches, item.quantity)
    lines.push({
      variantId: item.variantId,
      productName: item.productName,
      dose: item.dose ?? '',
      sku: item.sku ?? '',
      quantityNeeded: item.quantity,
      draws,
      shortfall,
    })
    totalUnits += item.quantity
    totalShortfall += shortfall
  }

  lines.sort((a, b) => a.productName.localeCompare(b.productName) || a.dose.localeCompare(b.dose))

  return {
    lines,
    totalUnits,
    totalShortfall,
    fullyAllocatable: totalShortfall === 0,
  }
}
