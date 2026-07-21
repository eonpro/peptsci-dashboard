// Public email API. High-level, intent-named senders that the rest of the app
// calls. Each builds a branded template and delegates to the SES driver. All
// are fire-and-forget safe (never throw; return a SendEmailResult).

import { sendEmail, isEmailEnabled, type SendEmailResult } from './client'
import {
  welcomeEmail,
  partnerApprovedEmail,
  partnerRejectedEmail,
  partnerNeedsInfoEmail,
  affiliateApplicationReceivedEmail,
  affiliateApprovedEmail,
  affiliateRejectedEmail,
  partnerRepInviteEmail,
  partnerTeamInviteEmail,
  partnerClinicAttributedEmail,
  partnerPayoutRecordedEmail,
  partnerDailyDigestEmail,
  orderConfirmationEmail,
  orderShippedEmail,
  orderDeliveredEmail,
  orderExceptionEmail,
  invoiceIssuedEmail,
  invoiceOverdueEmail,
  statementEmail,
  weeklyReportEmail,
  backInStockEmail,
  type OrderConfirmationEmailOpts,
  type ShipmentEmailOpts,
  type InvoiceEmailOpts,
  type StatementEmailOpts,
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

// ── Affiliate partner program (sales orgs / reps) ──

export async function sendAffiliateApplicationReceivedEmail(opts: {
  to: string | string[]
  contactName?: string | null
  orgName: string
  reference?: string
}): Promise<SendEmailResult> {
  const { subject, html, text } = affiliateApplicationReceivedEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendAffiliateApprovedEmail(opts: {
  to: string | string[]
  contactName?: string | null
  orgName: string
  inviteUrl?: string | null
  existingAccount?: boolean
}): Promise<SendEmailResult> {
  const { subject, html, text } = affiliateApprovedEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendPartnerRepInviteEmail(opts: {
  to: string | string[]
  repName?: string | null
  orgName: string
  inviteUrl: string
}): Promise<SendEmailResult> {
  const { subject, html, text } = partnerRepInviteEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendPartnerTeamInviteEmail(opts: {
  to: string | string[]
  name?: string | null
  orgName: string
  role: 'ADMIN' | 'VIEWER'
  inviteUrl: string
}): Promise<SendEmailResult> {
  const { subject, html, text } = partnerTeamInviteEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendAffiliateRejectedEmail(opts: {
  to: string | string[]
  contactName?: string | null
  orgName: string
  reason?: string
}): Promise<SendEmailResult> {
  const { subject, html, text } = affiliateRejectedEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendPartnerClinicAttributedEmail(opts: {
  to: string | string[]
  contactName?: string | null
  clinicName: string
  via: 'link' | 'lead'
}): Promise<SendEmailResult> {
  const { subject, html, text } = partnerClinicAttributedEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendPartnerPayoutRecordedEmail(opts: {
  to: string | string[]
  contactName?: string | null
  amount: string
  method?: string | null
  reference?: string | null
}): Promise<SendEmailResult> {
  const { subject, html, text } = partnerPayoutRecordedEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

export async function sendPartnerDailyDigestEmail(opts: {
  to: string | string[]
  contactName?: string | null
  dateLabel: string
  earned: string
  transactionCount: number
  unpaid: string
}): Promise<SendEmailResult> {
  const { subject, html, text } = partnerDailyDigestEmail(opts)
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

export async function sendStatementEmail(
  opts: { to: string | string[] } & StatementEmailOpts
): Promise<SendEmailResult> {
  const { subject, html, text } = statementEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

// ── Back-in-stock alerts (customer-facing) ──

export async function sendBackInStockEmail(opts: {
  to: string | string[]
  contactName?: string | null
  productName: string
  dose?: string | null
  sku: string
}): Promise<SendEmailResult> {
  const { subject, html, text } = backInStockEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}

// ── Internal reporting ──

export async function sendWeeklyReportEmail(
  opts: { to: string | string[] } & WeeklyReportEmailOpts
): Promise<SendEmailResult> {
  const { subject, html, text } = weeklyReportEmail(opts)
  return sendEmail({ to: opts.to, subject, html, text })
}
