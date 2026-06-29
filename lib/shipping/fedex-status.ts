/**
 * Pure FedEx status mapping (no Prisma/network imports) so the tracking poller's
 * decision logic is unit-testable.
 *
 * Maps FedEx "derived" status codes (latestStatusDetail.code) onto the small set
 * of shipping statuses we persist in `Order.shippingStatus`.
 */

export type ShippingStatus =
  | 'LABEL_CREATED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'CANCELLED'

/** Statuses that need no further polling. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set<string>(['DELIVERED', 'CANCELLED'])

export function isTerminalShippingStatus(status: string | null | undefined): boolean {
  return status != null && TERMINAL_STATUSES.has(status)
}

const CODE_MAP: Record<string, ShippingStatus> = {
  DL: 'DELIVERED',
  OD: 'OUT_FOR_DELIVERY',
  CA: 'CANCELLED',
  DE: 'EXCEPTION', // delivery exception
  SE: 'EXCEPTION', // shipment exception
  OC: 'LABEL_CREATED', // order/shipment info sent to FedEx
  // In-transit family
  PU: 'IN_TRANSIT', // picked up
  IT: 'IN_TRANSIT', // in transit
  IN: 'IN_TRANSIT', // initiated
  AR: 'IN_TRANSIT', // arrived at location
  DP: 'IN_TRANSIT', // departed
  AP: 'IN_TRANSIT', // at pickup
  HL: 'IN_TRANSIT', // hold at location
}

/**
 * Map a FedEx derived status code to our shipping status. Unknown codes return
 * null so the caller leaves the existing status untouched.
 */
export function mapFedExStatusToShipping(
  code: string | null | undefined
): ShippingStatus | null {
  if (!code) return null
  return CODE_MAP[code.toUpperCase()] ?? null
}

// ---------------------------------------------------------------------------
// Display helpers (pure) — used by the public tracking page.
// ---------------------------------------------------------------------------

/** Human-friendly label for a stored shipping status. */
export const SHIPPING_STATUS_LABELS: Record<ShippingStatus, string> = {
  LABEL_CREATED: 'Label created',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Exception',
  CANCELLED: 'Cancelled',
}

export function describeShippingStatus(status: string | null | undefined): string {
  if (!status) return 'Awaiting shipment'
  return SHIPPING_STATUS_LABELS[status as ShippingStatus] ?? status
}

/** The normal happy-path progression, in order. */
export const TIMELINE_STEPS: ReadonlyArray<ShippingStatus> = [
  'LABEL_CREATED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]

export interface TimelineStep {
  status: ShippingStatus
  label: string
  reached: boolean
  current: boolean
}

/**
 * Build a linear timeline for the tracking UI. Steps at or before the current
 * status are `reached`; the current status is flagged `current`. EXCEPTION and
 * CANCELLED are off-path: nothing is marked current and only LABEL_CREATED is
 * treated as reached (the package did at least get a label).
 */
export function trackingTimeline(status: string | null | undefined): TimelineStep[] {
  const idx = status ? TIMELINE_STEPS.indexOf(status as ShippingStatus) : -1
  return TIMELINE_STEPS.map((s, i) => ({
    status: s,
    label: SHIPPING_STATUS_LABELS[s],
    reached: idx >= 0 ? i <= idx : i === 0 && status === 'LABEL_CREATED',
    current: idx >= 0 && i === idx,
  }))
}

/** Whether a status represents an off-path problem state. */
export function isExceptionStatus(status: string | null | undefined): boolean {
  return status === 'EXCEPTION' || status === 'CANCELLED'
}
