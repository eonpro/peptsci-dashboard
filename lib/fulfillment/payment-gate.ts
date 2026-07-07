/**
 * Pay-before-ship gate. Fulfillment (FedEx labels, stock consume) must not
 * proceed for unpaid orders unless the order is on an invoice (net-terms AR
 * handles collection) or an admin explicitly overrides — overrides are
 * audit-logged by the callers.
 */

export type PaymentGateReason = 'captured' | 'invoiced' | 'override' | 'unpaid'

export interface PaymentGateInput {
  /** Order.paymentStatus (PaymentStatus enum value). */
  paymentStatus: string
  /** True when the order is linked to at least one invoice line item. */
  invoiced: boolean
  /** Explicit admin override (must be audit-logged by the caller). */
  override?: boolean
}

export interface PaymentGateResult {
  allowed: boolean
  reason: PaymentGateReason
}

export function assessShipmentPaymentGate(input: PaymentGateInput): PaymentGateResult {
  if (input.paymentStatus === 'CAPTURED') return { allowed: true, reason: 'captured' }
  if (input.invoiced) return { allowed: true, reason: 'invoiced' }
  if (input.override) return { allowed: true, reason: 'override' }
  return { allowed: false, reason: 'unpaid' }
}

export const PAYMENT_GATE_MESSAGE =
  'Order has not been paid (payment not captured and not invoiced). ' +
  'Collect payment or invoice the order first, or pass the explicit unpaid-ship override.'
