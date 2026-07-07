/**
 * Pure (DB-free) validation + normalization for a single manually-entered
 * sale/customer record (the "Add Customer" dialog). Mirrors the semantics of
 * the CSV sales importer (lib/sales-import.ts) for one row: a record must
 * identify a customer; sale figures are optional and derived when possible.
 *
 * COGS estimation needs the catalog, so it stays in the API route — this
 * module only validates and normalizes user input.
 */

import { coerceDate } from './csv-coerce'

export interface ManualSaleInput {
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  /** Free-form date string; validated with the shared CSV date coercion. */
  date?: string
  orderRef?: string
  product?: string
  vials?: number
  amountPerVial?: number
  paidAmount?: number
  invoicePaid?: boolean
  trackingNumber?: string
  notes?: string
  unitCost?: number
}

/** Normalized values ready to persist as a SalesRecord (minus COGS). */
export interface NormalizedManualSale {
  customerName: string
  customerEmail: string
  customerPhone: string
  address: string
  city: string
  state: string
  zip: string
  date: Date | null
  orderRef: string
  product: string
  vials: number
  amountPerVial: number
  paidAmount: number
  invoicePaid: boolean
  trackingNumber: string
  notes: string
  unitCost?: number
}

export type ManualSaleResult =
  | { ok: true; value: NormalizedManualSale }
  | { ok: false; errors: string[] }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function str(v: string | undefined): string {
  return (v ?? '').trim()
}

function checkNonNegative(label: string, v: number | undefined, errors: string[]): void {
  if (v === undefined) return
  if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${label} must be a number`)
  else if (v < 0) errors.push(`${label} must be >= 0`)
}

/**
 * Validate + normalize a manual sale/customer entry.
 *
 * Rules:
 *  - At least one of customerName / customerEmail / customerPhone is required.
 *  - customerEmail, when present, must look like an email.
 *  - vials must be a non-negative integer; money fields non-negative numbers.
 *  - date, when present, must parse (shared CSV date formats).
 *  - paidAmount defaults to vials * amountPerVial; amountPerVial defaults to
 *    paidAmount / vials when vials > 0.
 *  - invoicePaid defaults to paidAmount > 0.
 */
export function validateManualSale(input: ManualSaleInput): ManualSaleResult {
  const errors: string[] = []

  const customerName = str(input.customerName)
  const customerEmail = str(input.customerEmail)
  const customerPhone = str(input.customerPhone)

  if (!customerName && !customerEmail && !customerPhone) {
    errors.push('Provide at least a customer name, email, or phone')
  }
  if (customerEmail && !EMAIL_RE.test(customerEmail)) {
    errors.push('customerEmail is not a valid email address')
  }

  checkNonNegative('vials', input.vials, errors)
  if (input.vials !== undefined && Number.isFinite(input.vials) && !Number.isInteger(input.vials)) {
    errors.push('vials must be a whole number')
  }
  checkNonNegative('amountPerVial', input.amountPerVial, errors)
  checkNonNegative('paidAmount', input.paidAmount, errors)
  checkNonNegative('unitCost', input.unitCost, errors)

  const dateRaw = str(input.date)
  let date: Date | null = null
  if (dateRaw) {
    date = coerceDate(dateRaw)
    if (!date) errors.push('date is not a valid date')
  }

  if (errors.length > 0) return { ok: false, errors }

  const vials = input.vials ?? 0
  let amountPerVial = input.amountPerVial ?? 0
  let paidAmount = input.paidAmount ?? 0

  if (input.paidAmount === undefined && vials > 0 && amountPerVial > 0) {
    paidAmount = vials * amountPerVial
  }
  if (input.amountPerVial === undefined && vials > 0 && paidAmount > 0) {
    amountPerVial = paidAmount / vials
  }

  return {
    ok: true,
    value: {
      customerName,
      customerEmail,
      customerPhone,
      address: str(input.address),
      city: str(input.city),
      state: str(input.state),
      zip: str(input.zip),
      date,
      orderRef: str(input.orderRef),
      product: str(input.product),
      vials,
      amountPerVial,
      paidAmount,
      invoicePaid: input.invoicePaid ?? paidAmount > 0,
      trackingNumber: str(input.trackingNumber),
      notes: str(input.notes),
      unitCost: input.unitCost,
    },
  }
}
