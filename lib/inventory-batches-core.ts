/**
 * Pure, dependency-free inventory-batch logic.
 *
 * Holds validation + FIFO allocation planning with NO Prisma/Clerk imports so it
 * is unit-testable in isolation (mirrors the lib/access.ts convention). The
 * DB-bound service in lib/inventory-batches.ts re-exports these.
 */

export interface BatchActor {
  /** Clerk user id of the operator, if known. */
  clerkUserId?: string | null
  /** Display label (name or email) recorded on the batch + events. */
  label?: string | null
}

export interface CreateBatchInput {
  variantId?: string | null
  name?: string | null
  dose?: string | null
  vialSize?: string | null
  purity?: string | null
  bud: string
  receivedOn?: string | null
  qtyReceived: number
  qtyDamaged?: number
  yearColor?: string | null
  notes?: string | null
}

/** Lightweight, dependency-free date sanity check (YYYY-MM-DD, MM/DD/YYYY, or Date-parseable). */
function isParseableDate(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true
  if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(value)) return true
  return !Number.isNaN(new Date(value).getTime())
}

export class BatchValidationError extends Error {
  field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = 'BatchValidationError'
    this.field = field
  }
}

/**
 * Validate raw intake input. Throws {@link BatchValidationError} on the first
 * problem. Pure — safe to call in tests and before opening a transaction.
 */
export function validateCreateInput(input: CreateBatchInput): void {
  if (!Number.isInteger(input.qtyReceived) || input.qtyReceived <= 0) {
    throw new BatchValidationError('Amount received must be a positive whole number', 'qtyReceived')
  }
  const damaged = input.qtyDamaged ?? 0
  if (!Number.isInteger(damaged) || damaged < 0) {
    throw new BatchValidationError(
      'Damaged count must be zero or a positive whole number',
      'qtyDamaged'
    )
  }
  if (damaged > input.qtyReceived) {
    throw new BatchValidationError('Damaged count cannot exceed amount received', 'qtyDamaged')
  }
  if (!input.bud) {
    throw new BatchValidationError('BUD (Beyond-Use Date) is required', 'bud')
  }
  if (!isParseableDate(input.bud)) {
    throw new BatchValidationError('BUD is not a valid date', 'bud')
  }
  if (input.yearColor && !/^#[0-9a-fA-F]{6}$/.test(input.yearColor)) {
    throw new BatchValidationError('Accent color must be a #rrggbb hex value', 'yearColor')
  }
  if (!input.variantId) {
    if (!input.name || !input.name.trim()) {
      throw new BatchValidationError('Product name is required', 'name')
    }
    if (!input.dose || !input.dose.trim()) {
      throw new BatchValidationError('Dose is required', 'dose')
    }
  }
}

/** A batch with at least the fields needed for FIFO allocation planning. */
export interface AllocatableBatch {
  id: string
  batchNumber: string
  bud: Date
  qtyOnHand: number
}

export interface AllocationDraw {
  batchId: string
  batchNumber: string
  qty: number
}

export interface AllocationPlan {
  draws: AllocationDraw[]
  allocated: number
  shortfall: number
}

/**
 * Plan how to satisfy `qty` units from the given batches, oldest BUD first.
 * Pure and DB-free. Does not mutate anything.
 */
export function planAllocation(batches: AllocatableBatch[], qty: number): AllocationPlan {
  const sorted = [...batches]
    .filter((b) => b.qtyOnHand > 0)
    .sort((a, b) => a.bud.getTime() - b.bud.getTime() || a.batchNumber.localeCompare(b.batchNumber))

  const draws: AllocationDraw[] = []
  let remaining = Math.max(0, Math.trunc(qty))
  for (const b of sorted) {
    if (remaining <= 0) break
    const take = Math.min(b.qtyOnHand, remaining)
    if (take > 0) {
      draws.push({ batchId: b.id, batchNumber: b.batchNumber, qty: take })
      remaining -= take
    }
  }
  const allocated = draws.reduce((s, d) => s + d.qty, 0)
  return { draws, allocated, shortfall: remaining }
}
