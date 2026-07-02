/**
 * Plain-text SMS bodies (customer-facing). Kept short and PHI-free — order
 * number + tracking link only. Mirrors the email templates' shipment lifecycle.
 *
 * @module lib/sms/templates
 */

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')

function trackingUrl(trackingNumber: string): string {
  return `${APP_URL}/tracking/${encodeURIComponent(trackingNumber)}`
}

export interface ShipmentSmsOpts {
  orderNumber: number | string
  trackingNumber: string
  carrier?: string | null
}

export function orderShippedSms(opts: ShipmentSmsOpts): string {
  const carrier = opts.carrier?.trim() || 'FedEx'
  return `PeptSci: Order #${opts.orderNumber} shipped via ${carrier}. Track: ${trackingUrl(opts.trackingNumber)}`
}

export function orderDeliveredSms(opts: ShipmentSmsOpts): string {
  return `PeptSci: Order #${opts.orderNumber} was delivered. Details: ${trackingUrl(opts.trackingNumber)}`
}

export function orderExceptionSms(opts: ShipmentSmsOpts): string {
  return `PeptSci: A delivery exception was reported for order #${opts.orderNumber}. Status: ${trackingUrl(
    opts.trackingNumber
  )}`
}

export interface InvoiceSmsOpts {
  invoiceNumber: string
  amountDue: string
  dueDate: string
}

export function invoiceOverdueSms(opts: InvoiceSmsOpts): string {
  return `PeptSci: Invoice ${opts.invoiceNumber} (${opts.amountDue}) is past due (was due ${opts.dueDate}). Please remit payment.`
}
