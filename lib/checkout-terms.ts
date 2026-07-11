/**
 * Pure eligibility check for "bill to account" (net-terms) checkout.
 *
 * A client may check out on terms only when an admin has set
 * `Client.paymentTermsDays` (> 0). When `creditLimit` is set, the client's
 * open AR balance plus the new order total must stay within it. Dollars as
 * plain numbers at this boundary; no Prisma imports so it unit-tests in
 * isolation (mirrors lib/invoicing/core.ts).
 */

export interface TermsCheckoutInput {
  /** Client.paymentTermsDays — null/0/negative means terms are not enabled. */
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
  const termsDays = input.paymentTermsDays ?? 0
  if (!Number.isFinite(termsDays) || termsDays <= 0) {
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
