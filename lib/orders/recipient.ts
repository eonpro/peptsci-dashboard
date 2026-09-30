/**
 * Who an order ships to — resolved the same way on every admin surface that
 * prints or lists a recipient (fulfillment queue + wizard, FedEx label prefill,
 * packing slip, invoices).
 *
 * Why this exists: `Order.shippingAddress` is a JSON snapshot whose shape
 * depends on which writer created the order:
 *
 *   - admin New Order / Shopify / Stripe convert → `name` (+ `personName`)
 *   - shop checkout "ship to patient" (legacy)   → `firstName` + `lastName` only
 *   - shop checkout "ship to practice"           → `company`, no person
 *
 * On top of that, patient shipments link the saved `Patient` row. The admin
 * views only read `name` / `personName`, so patient orders placed through the
 * shop (Element Labs, InCare) showed no patient on labels or invoices. Reading
 * the recipient here — and only here — keeps the surfaces from drifting apart.
 *
 * Pure and dependency-free: safe for client components and node tests.
 */

/** Minimal Patient shape needed to name a recipient (matches a Prisma select). */
export type PatientNameLike =
  | { firstName?: string | null; lastName?: string | null }
  | null
  | undefined

export interface OrderRecipientInput {
  /** `Order.shipTo` — 'PRACTICE' | 'PATIENT'. */
  shipTo?: string | null
  /** `Order.shippingAddress` JSON snapshot. */
  shippingAddress?: unknown
  /** The linked `Order.patient`, when the order was placed for a saved patient. */
  patient?: PatientNameLike
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Last name stored for single-word names (see splitPersonName): "—" / "-" only. */
const PLACEHOLDER_LAST_NAME = /^[\s\u2014\u2013-]*$/

/** "First Last", tolerating blanks and the "—" placeholder last name. */
export function joinPersonName(firstName: unknown, lastName: unknown): string {
  const first = clean(firstName)
  const last = clean(lastName)
  return [first, PLACEHOLDER_LAST_NAME.test(last) ? '' : last].filter(Boolean).join(' ')
}

/**
 * Person named on an address snapshot, whichever writer produced it. `personName`
 * (the FedEx field) wins, then `name`, then first + last, then the legacy
 * `contactName` alias the packing slip has always honoured.
 */
export function recipientNameFromAddress(addr: unknown): string {
  const a = asRecord(addr)
  if (!a) return ''
  return (
    clean(a.personName) ||
    clean(a.name) ||
    joinPersonName(a.firstName, a.lastName) ||
    clean(a.contactName)
  )
}

/** Company line on an address snapshot ('' when none). */
export function companyFromAddress(addr: unknown): string {
  const a = asRecord(addr)
  if (!a) return ''
  return clean(a.company) || clean(a.companyName)
}

/** Name of a saved patient row ('' when absent). */
export function recipientNameFromPatient(patient: PatientNameLike): string {
  return patient ? joinPersonName(patient.firstName, patient.lastName) : ''
}

/**
 * The person an order ships to. The address snapshot is read first because it
 * is what gets printed — the name then always matches the street beside it, even
 * if the saved patient is edited later. The linked patient is the fallback for
 * snapshots that carry no person at all.
 */
export function orderRecipientName(order: OrderRecipientInput): string {
  return recipientNameFromAddress(order.shippingAddress) || recipientNameFromPatient(order.patient)
}

/** What to show after "Ship to": the person, else the company on the address. */
export function orderShipToLabel(order: OrderRecipientInput): string {
  return orderRecipientName(order) || companyFromAddress(order.shippingAddress)
}

/**
 * The patient an order was shipped to, or '' for practice/pickup orders. Used
 * to itemize invoices: a practice-shipped order has nothing extra to name (the
 * snapshot may just carry the clinic's own contact).
 */
export function patientShipToName(order: OrderRecipientInput): string {
  return order.shipTo === 'PATIENT' ? orderRecipientName(order) : ''
}

/** Most words a search box may turn into name conditions. */
const MAX_NAME_SEARCH_WORDS = 5

type NameContains = { contains: string; mode: 'insensitive' }

export interface PatientNameSearchWhere {
  patient: {
    AND: Array<{ OR: [{ firstName: NameContains }, { lastName: NameContains }] }>
  }
}

/**
 * Prisma `Order` where-fragment matching the linked patient by name, so the
 * fulfillment queue can be searched by "jane doe" as well as order #, tracking
 * and clinic. Every typed word must match the first OR last name (so word order
 * doesn't matter). Null for a blank search.
 */
export function patientNameSearchWhere(search: string | null | undefined): PatientNameSearchWhere | null {
  const words = (search ?? '').split(/\s+/).filter(Boolean).slice(0, MAX_NAME_SEARCH_WORDS)
  if (words.length === 0) return null
  return {
    patient: {
      AND: words.map((word) => ({
        OR: [
          { firstName: { contains: word, mode: 'insensitive' as const } },
          { lastName: { contains: word, mode: 'insensitive' as const } },
        ] as [{ firstName: NameContains }, { lastName: NameContains }],
      })),
    },
  }
}
