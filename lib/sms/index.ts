// Public SMS API. Intent-named senders that the rest of the app calls. Each
// builds a short, PHI-free message and delegates to the Twilio driver. All are
// fire-and-forget safe (never throw; return a SendSmsResult) and no-op when
// SMS_ENABLED is unset — mirrors lib/email/index.ts.

import { sendSms, isSmsEnabled, type SendSmsResult } from './client'
import {
  orderShippedSms,
  orderDeliveredSms,
  orderExceptionSms,
  invoiceOverdueSms,
  type ShipmentSmsOpts,
  type InvoiceSmsOpts,
} from './templates'

export { isSmsEnabled, type SendSmsResult }

export async function sendOrderShippedSms(
  opts: { to: string } & ShipmentSmsOpts
): Promise<SendSmsResult> {
  return sendSms({ to: opts.to, body: orderShippedSms(opts) })
}

export async function sendOrderDeliveredSms(
  opts: { to: string } & ShipmentSmsOpts
): Promise<SendSmsResult> {
  return sendSms({ to: opts.to, body: orderDeliveredSms(opts) })
}

export async function sendOrderExceptionSms(
  opts: { to: string } & ShipmentSmsOpts
): Promise<SendSmsResult> {
  return sendSms({ to: opts.to, body: orderExceptionSms(opts) })
}

export async function sendInvoiceOverdueSms(
  opts: { to: string } & InvoiceSmsOpts
): Promise<SendSmsResult> {
  return sendSms({ to: opts.to, body: invoiceOverdueSms(opts) })
}
