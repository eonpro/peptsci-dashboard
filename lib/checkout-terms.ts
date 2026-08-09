/**
 * Pure eligibility check for "bill to account" (net-terms) checkout.
 *
 * A client may check out on terms only when an admin has set
 * `Client.paymentTermsDays` (including 0 = pay as billed / due on receipt).
 * `null` means card-only. When `creditLimit` is set, the client's open AR
 * balance plus the new order total must stay within it. Dollars as plain
 * numbers at this boundary; no Prisma imports so it unit-tests in isolation
 * (mirrors lib/invoicing/core.ts).
 */
import { z } from 'zod'

/** Admin UI presets for Client.paymentTermsDays (null = card-only). */
export const PAYMENT_TERMS_OPTIONS = [
  { value: null, label: 'Card only' },
  { value: 0, label: 'Pay as billed (net 0)' },
  { value: 7, label: 'Net 7' },
  { value: 14, label: 'Net 14' },
  { value: 30, label: 'Net 30' },
] as const

/**
 * Admin PATCH / UI: `null` = card-only; `0` = pay as billed (bill-to-account,
 * due on receipt); positive days = net terms. `undefined` = field omitted.
 */
export function normalizePaymentTermsDays(
  value: number | null | undefined
): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (!Number.isFinite(value) || value < 0) return null
  return Math.trunc(value)
}

/** Zod field for Client.paymentTermsDays — 0 is valid (pay as billed). */
export const paymentTermsDaysSchema = z.number().int().min(0).max(365).nullable().optional()

/** Human-readable label for admin/checkout display. */
export function formatPaymentTermsLabel(days: number | null | undefined): string {
  if (days == null) return 'Card only'
  if (days === 0) return 'Pay as billed (net 0)'
  return `Net ${days}`
}

export interface TermsCheckoutInput {
  /** Client.paymentTermsDays — null means card-only; 0+ enables bill-to-account. */
  paymentTermsDays: number | null
  /** Client.creditLimit in dollars — null means no cap. */
  creditLimit: number | null
  /** Sum of amountDue across the client's open (non-void) invoices. */
  openBalance: number
  /** Server-computed total of the order being placed. */
  orderTotal: number
  /** Credit hold: any OVERDUE invoice pauses terms until it is paid. */
  hasOverdue?: boolean
}

export type TermsCheckoutResult =
  | { allowed: true; termsDays: number }
  | { allowed: false; reason: 'NO_TERMS' }
  | { allowed: false; reason: 'CREDIT_HOLD' }
  | { allowed: false; reason: 'OVER_CREDIT_LIMIT'; availableCredit: number }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function assessTermsCheckout(input: TermsCheckoutInput): TermsCheckoutResult {
  if (input.paymentTermsDays == null) {
    return { allowed: false, reason: 'NO_TERMS' }
  }
  const termsDays = input.paymentTermsDays
  if (!Number.isFinite(termsDays) || termsDays < 0) {
    return { allowed: false, reason: 'NO_TERMS' }
  }
  if (input.hasOverdue) {
    return { allowed: false, reason: 'CREDIT_HOLD' }
  }
  if (input.creditLimit != null) {
    const availableCredit = round2(Math.max(0, input.creditLimit - input.openBalance))
    if (round2(input.openBalance + input.orderTotal) > input.creditLimit) {
      return { allowed: false, reason: 'OVER_CREDIT_LIMIT', availableCredit }
    }
  }
  return { allowed: true, termsDays: Math.trunc(termsDays) }
}
