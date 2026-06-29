/**
 * Pure, dependency-free Returns/RMA helpers: RMA number formatting and the
 * status-transition state machine. Kept free of Prisma/Clerk imports so the
 * workflow rules are unit-testable and reusable by the service + API layers.
 */

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'LABEL_SENT'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'INSPECTED'
  | 'RESTOCKED'
  | 'REFUNDED'
  | 'CLOSED'

export type ReturnItemCondition = 'GOOD' | 'DAMAGED' | 'MISSING'

/** Date parts (UTC) zero-padded for an RMA number. */
function ymd(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * Canonical RMA number: `RMA-YYYYMMDD-NNN` (seq is 1-based, zero-padded to 3).
 * Uniqueness is the caller's responsibility (DB unique index + retry).
 */
export function formatRmaNumber(date: Date, seq: number): string {
  const n = Math.max(1, Math.floor(seq))
  return `RMA-${ymd(date)}-${String(n).padStart(3, '0')}`
}

/** Statuses that accept no further transitions. */
export const TERMINAL_RETURN_STATUSES: ReadonlySet<ReturnStatus> = new Set<ReturnStatus>([
  'CLOSED',
])

/**
 * Allowed forward transitions. CLOSED is reachable from every non-terminal
 * state (an RMA can always be closed/abandoned).
 */
const TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CLOSED'],
  APPROVED: ['LABEL_SENT', 'IN_TRANSIT', 'RECEIVED', 'REJECTED', 'CLOSED'],
  LABEL_SENT: ['IN_TRANSIT', 'RECEIVED', 'CLOSED'],
  IN_TRANSIT: ['RECEIVED', 'CLOSED'],
  RECEIVED: ['INSPECTED', 'RESTOCKED', 'REFUNDED', 'CLOSED'],
  INSPECTED: ['RESTOCKED', 'REFUNDED', 'CLOSED'],
  RESTOCKED: ['REFUNDED', 'CLOSED'],
  REFUNDED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CLOSED: [],
}

export function nextStatuses(from: ReturnStatus): ReturnStatus[] {
  return TRANSITIONS[from] ?? []
}

export function canTransition(from: ReturnStatus, to: ReturnStatus): boolean {
  if (from === to) return false
  return (TRANSITIONS[from] ?? []).includes(to)
}

export function isTerminalReturnStatus(status: ReturnStatus): boolean {
  return TERMINAL_RETURN_STATUSES.has(status)
}

/**
 * Whether an item is eligible to be restocked: it must be in GOOD condition and
 * not already restocked, and the request must have physically arrived
 * (RECEIVED or INSPECTED).
 */
export function isRestockEligible(params: {
  status: ReturnStatus
  condition: ReturnItemCondition
  restocked: boolean
}): boolean {
  if (params.restocked) return false
  if (params.condition !== 'GOOD') return false
  return params.status === 'RECEIVED' || params.status === 'INSPECTED'
}
