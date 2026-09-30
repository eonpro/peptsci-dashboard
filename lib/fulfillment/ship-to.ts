/**
 * Ship-to presentation shared by the fulfillment queue, the guided wizard and
 * the FedEx label prefill. Pure so the rules are unit-tested rather than
 * re-implemented inside client components.
 *
 * The core rule: on a ship-to-PATIENT order the package is addressed to the
 * patient. It must never quietly fall back to the clinic's contact, or the label
 * and the accounting trail name the wrong person.
 */

import {
  orderRecipientName,
  orderShipToLabel,
  type PatientNameLike,
} from '../orders/recipient'

export interface ShipToOrderLike {
  /** `Order.shipTo` — 'PRACTICE' | 'PATIENT'. */
  shipTo?: string | null
  shipSpeed?: string | null
  shippingAddress?: unknown
  /** Recipient already resolved server-side (`GET /api/admin/orders`). */
  recipientName?: string | null
  patient?: PatientNameLike
  client?: { organizationName?: string | null; contactName?: string | null } | null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * The person to address the package to. Patient orders resolve to the patient
 * only; practice orders fall back to the clinic contact (and, with
 * `orgFallback`, the organization — for a non-white-label FedEx label).
 */
export function shipToPersonName(
  order: ShipToOrderLike,
  opts: { orgFallback?: boolean } = {}
): string {
  const recipient = str(order.recipientName) || orderRecipientName(order)
  if (recipient) return recipient
  if (order.shipTo === 'PATIENT') return ''
  return (
    str(order.client?.contactName) || (opts.orgFallback ? str(order.client?.organizationName) : '')
  )
}

/** Queue-row heading after "Ship to:" — the person, else the address's company. */
export function shipToDisplayName(order: ShipToOrderLike): string {
  return str(order.recipientName) || orderShipToLabel(order)
}

/** One-line ship-to for the wizard header: who · street · city, ST zip. */
export function formatShipToSummary(order: ShipToOrderLike): string {
  const a = asRecord(order.shippingAddress)

  if (order.shipSpeed === 'PICKUP') {
    const who =
      str(a.company) ||
      str(order.client?.organizationName) ||
      str(a.name) ||
      str(a.personName) ||
      str(order.client?.contactName) ||
      'Practice'
    return `Office pickup · ${who}`
  }

  const name = shipToPersonName(order)
  const line = [str(a.address1) || str(a.line1) || str(a.street), str(a.address2) || str(a.line2)]
    .filter(Boolean)
    .join(', ')
  const city = [str(a.city), [str(a.state), str(a.zip)].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
  return [name, line, city].filter(Boolean).join(' · ') || 'No shipping address on file'
}
