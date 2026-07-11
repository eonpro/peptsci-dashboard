// Public email API. High-level, intent-named senders that the rest of the app
// calls. Each builds a branded template and delegates to the SES driver. All
// are fire-and-forget safe (never throw; return a SendEmailResult).

import { sendEmail, isEmailEnabled, type SendEmailResult } from './client'
import {
  welcomeEmail,
  partnerApprovedEmail,
  partnerRejectedEmail,
  partnerNeedsInfoEmail,
  orderConfirmationEmail,
  orderShippedEmail,
  orderDeliveredEmail,
  orderExceptionEmail,
  invoiceIssuedEmail,
  invoiceOverdueEmail,
  weeklyReportEmail,
  type OrderConfirmationEmailOpts,
  type ShipmentEmailOpts,
  type InvoiceEmailOpts,
  type WeeklyReportEmailOpts,
} from './templates'

export { isEmailEnabled, type SendEmailResult }

export async function sendWelcomeEmail(opts: {
  to: string
  firstName?: string | null
}): Promise<SendEmailResult> {
  const { subject, html, text } = welcomeEmail({ firstName: opts.firstName })
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendPartnerApprovedEmail(opts: {
  to: string | string[]
  name?: string | null
}): Promise<SendEmailResult> {
  const { subject, html, text } = partnerApprovedEmail({ name: opts.name })
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendPartnerRejectedEmail(opts: {
  to: string | string[]
  name?: string | null
  reason?: string
}): Promise<SendEmailResult> {
  const { subject, html, text } = partnerRejectedEmail({ name: opts.name, reason: opts.reason })
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendPartnerNeedsInfoEmail(opts: {
  to: string | string[]
  name?: string | null
  message?: string
}): Promise<SendEmailResult> {
  const { subject, html, text } = partnerNeedsInfoEmail({ name: opts.name, message: opts.message })
  return sendEmail({ to: opts.to, subject, html, text })
}

// ── Order lifecycle (customer-facing) ──

export async function sendOrderConfirmationEmail(
  opts: { to: string | string[] } & OrderConfirmationEmailOpts
): Promise<SendEmailResult> {
  const { subject, html, text } = orderConfirmationEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

// ── Shipment lifecycle (customer-facing) ──

export async function sendOrderShippedEmail(
  opts: { to: string | string[] } & ShipmentEmailOpts
): Promise<SendEmailResult> {
  const { subject, html, text } = orderShippedEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendOrderDeliveredEmail(
  opts: { to: string | string[] } & ShipmentEmailOpts
): Promise<SendEmailResult> {
  const { subject, html, text } = orderDeliveredEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendOrderExceptionEmail(
  opts: { to: string | string[] } & ShipmentEmailOpts
): Promise<SendEmailResult> {
  const { subject, html, text } = orderExceptionEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

// ── Billing (account-facing) ──

export async function sendInvoiceIssuedEmail(
  opts: { to: string | string[] } & InvoiceEmailOpts
): Promise<SendEmailResult> {
  const { subject, html, text } = invoiceIssuedEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendInvoiceOverdueEmail(
  opts: { to: string | string[] } & InvoiceEmailOpts & { daysPastDue: number }
): Promise<SendEmailResult> {
  const { subject, html, text } = invoiceOverdueEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

// ── Internal reporting ──

export async function sendWeeklyReportEmail(
  opts: { to: string | string[] } & WeeklyReportEmailOpts
): Promise<SendEmailResult> {
  const { subject, html, text } = weeklyReportEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}
