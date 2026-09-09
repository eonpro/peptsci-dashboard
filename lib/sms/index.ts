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

/** Recipient + optional delivery-log links shared by every sender. */
export interface SmsRecipient {
  to: string
  /** Order the text is about (SmsMessage.orderId). */
  orderId?: string | null
  /** Practice the text is going to (SmsMessage.clientId). */
  clientId?: string | null
}

export async function sendOrderShippedSms(opts: SmsRecipient & ShipmentSmsOpts): Promise<SendSmsResult> {
  return sendSms({
    to: opts.to,
    body: orderShippedSms(opts),
    kind: 'ORDER_SHIPPED',
    orderId: opts.orderId,
    clientId: opts.clientId,
  })
}

export async function sendOrderDeliveredSms(opts: SmsRecipient & ShipmentSmsOpts): Promise<SendSmsResult> {
  return sendSms({
    to: opts.to,
    body: orderDeliveredSms(opts),
    kind: 'ORDER_DELIVERED',
    orderId: opts.orderId,
    clientId: opts.clientId,
  })
}

export async function sendOrderExceptionSms(opts: SmsRecipient & ShipmentSmsOpts): Promise<SendSmsResult> {
  return sendSms({
    to: opts.to,
    body: orderExceptionSms(opts),
    kind: 'ORDER_EXCEPTION',
    orderId: opts.orderId,
    clientId: opts.clientId,
  })
}

export async function sendInvoiceOverdueSms(opts: SmsRecipient & InvoiceSmsOpts): Promise<SendSmsResult> {
  return sendSms({
    to: opts.to,
    body: invoiceOverdueSms(opts),
    kind: 'INVOICE_OVERDUE',
    clientId: opts.clientId,
  })
}
