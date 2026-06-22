// Public email API. High-level, intent-named senders that the rest of the app
// calls. Each builds a branded template and delegates to the SES driver. All
// are fire-and-forget safe (never throw; return a SendEmailResult).

import { sendEmail, isEmailEnabled, type SendEmailResult } from './client'
import {
  welcomeEmail,
  partnerApprovedEmail,
  partnerRejectedEmail,
  partnerNeedsInfoEmail,
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
