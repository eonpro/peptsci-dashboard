/**
 * Low-level Twilio SMS driver. Gated behind SMS_ENABLED so the platform never
 * texts until credentials + the flag are in place; when disabled, sends are
 * logged and skipped (build/dev/preview safe) — mirrors the SES email client.
 *
 * Uses the Twilio REST API over `fetch` (Basic auth, form-encoded) rather than
 * the `twilio` SDK, to avoid a heavy dependency and serverless cold-start cost.
 *
 * @module lib/sms/client
 */

import { logger } from '../logger'
import { toE164US } from './phone'

const SMS_ENABLED = process.env.SMS_ENABLED === 'true'
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || ''
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ''
// Either a From number (E.164) or a Messaging Service SID may be configured.
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || ''
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || ''

export interface SendSmsInput {
  to: string
  body: string
}

export interface SendSmsResult {
  ok: boolean
  skipped?: boolean
  sid?: string
  error?: string
}

/** True only when the flag, credentials, and a sender are all configured. */
export function isSmsEnabled(): boolean {
  return Boolean(SMS_ENABLED && ACCOUNT_SID && AUTH_TOKEN && (FROM_NUMBER || MESSAGING_SERVICE_SID))
}

/**
 * Send a single SMS via Twilio. Never throws — returns a result object so
 * callers (webhooks, crons, admin routes) can fire-and-forget without risking a
 * 500 if delivery fails. No-ops (skipped) when SMS is disabled or the number is
 * invalid.
 */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const to = toE164US(input.to)
  if (!to) {
    return { ok: false, error: 'Invalid phone number' }
  }
  const body = input.body?.trim()
  if (!body) {
    return { ok: false, error: 'Empty message body' }
  }

  if (!isSmsEnabled()) {
    logger.info('SMS disabled (set SMS_ENABLED=true + Twilio creds) — skipping', { to })
    return { ok: true, skipped: true }
  }

  try {
    const params = new URLSearchParams({ To: to, Body: body })
    if (MESSAGING_SERVICE_SID) params.set('MessagingServiceSid', MESSAGING_SERVICE_SID)
    else params.set('From', FROM_NUMBER)

    const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )

    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string }
    if (!res.ok) {
      const error = data.message || `Twilio responded ${res.status}`
      logger.error('SMS send failed', { to, status: res.status, error })
      return { ok: false, error }
    }

    logger.info('SMS sent', { to, sid: data.sid })
    return { ok: true, sid: data.sid }
  } catch (error) {
    logger.error(
      'SMS send failed',
      { to },
      error instanceof Error ? error : new Error(String(error))
    )
    return { ok: false, error: error instanceof Error ? error.message : 'send failed' }
  }
}
