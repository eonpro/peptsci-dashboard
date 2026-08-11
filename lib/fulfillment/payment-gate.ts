/**
 * Pay-before-ship gate. Fulfillment (FedEx labels, stock consume) must not
 * proceed for unpaid orders unless the client is on payment terms (Net 30 tab
 * — ship now, bill later), the order is already on an invoice, or an admin
 * explicitly overrides — overrides are audit-logged by the callers.
 */

export type PaymentGateReason =
  | 'captured'
  | 'invoiced'
  | 'terms'
  | 'override'
  | 'unpaid'
  | 'refunded'

export interface PaymentGateInput {
  /** Order.paymentStatus (PaymentStatus enum value). */
  paymentStatus: string
  /** True when the order is linked to at least one invoice line item. */
  invoiced: boolean
  /**
   * Client has paymentTermsDays set (including 0 = pay as billed). Allows
   * ship-before-invoice for tab / Net 30 email orders.
   */
  onTerms?: boolean
  /** Explicit admin override (must be audit-logged by the caller). */
  override?: boolean
}

export interface PaymentGateResult {
  allowed: boolean
  reason: PaymentGateReason
}

export function assessShipmentPaymentGate(input: PaymentGateInput): PaymentGateResult {
  // A fully refunded order must never ship, even when invoiced or overridden —
  // the money has already been returned to the buyer.
  if (input.paymentStatus === 'REFUNDED') return { allowed: false, reason: 'refunded' }
  if (input.paymentStatus === 'CAPTURED') return { allowed: true, reason: 'captured' }
  if (input.invoiced) return { allowed: true, reason: 'invoiced' }
  if (input.onTerms) return { allowed: true, reason: 'terms' }
  if (input.override) return { allowed: true, reason: 'override' }
  return { allowed: false, reason: 'unpaid' }
}

export const PAYMENT_GATE_MESSAGE =
  'Order has not been paid (payment not captured, not on terms, and not invoiced). ' +
  'Collect payment, set client payment terms, invoice the order, or pass the explicit unpaid-ship override.'

export const PAYMENT_GATE_REFUNDED_MESSAGE =
  'Order payment was refunded — refunded orders cannot be shipped.'
