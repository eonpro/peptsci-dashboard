/**
 * Pure, dependency-free inventory-reservation helpers: availability math, the
 * reservation status state machine, and order-line aggregation. Kept free of
 * Prisma imports so the rules are unit-testable and reusable by the service.
 */

export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED'

/**
 * Units available to commit to NEW orders. Reserved stock is already promised to
 * open orders, so it is subtracted from on-hand. Can go negative when oversold
 * (more reserved than physically on hand) — callers decide whether to block.
 */
export function availableQty(onHand: number, reserved: number): number {
  return (onHand || 0) - (reserved || 0)
}

/** True when commitments exceed physical stock. */
export function isOversold(onHand: number, reserved: number): boolean {
  return (reserved || 0) > (onHand || 0)
}

/**
 * Whether `want` more units can be reserved without overselling, given current
 * on-hand and already-reserved counts.
 */
export function canReserve(onHand: number, reserved: number, want: number): boolean {
  if (want <= 0) return false
  return availableQty(onHand, reserved) >= want
}

const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  ACTIVE: ['RELEASED', 'CONSUMED'],
  RELEASED: [],
  CONSUMED: [],
}

export function canTransitionReservation(from: ReservationStatus, to: ReservationStatus): boolean {
  if (from === to) return false
  return (TRANSITIONS[from] ?? []).includes(to)
}

export function isTerminalReservation(status: ReservationStatus): boolean {
  return status === 'RELEASED' || status === 'CONSUMED'
}

export interface VariantQty {
  variantId: string
  quantity: number
}

/**
 * Aggregate order lines into one quantity per variant (an order may have several
 * lines of the same variant). Non-positive quantities and blank variant IDs are
 * dropped. Returns a stable, variantId-sorted array.
 */
export function aggregateByVariant(lines: VariantQty[]): VariantQty[] {
  const totals = new Map<string, number>()
  for (const line of lines) {
    if (!line.variantId) continue
    const q = Math.floor(line.quantity)
    if (!Number.isFinite(q) || q <= 0) continue
    totals.set(line.variantId, (totals.get(line.variantId) ?? 0) + q)
  }
  return [...totals.entries()]
    .map(([variantId, quantity]) => ({ variantId, quantity }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId))
}
