/**
 * Low-level Twilio SMS driver. Gated behind SMS_ENABLED so the platform never
 * texts until credentials + the flag are in place; when disabled, sends are
 * logged and skipped (build/dev/preview safe) — mirrors the SES email client.
 *
 * Uses the Twilio REST API over `fetch` (Basic auth, form-encoded) rather than
 * the `twilio` SDK, to avoid a heavy dependency and serverless cold-start cost.
 *
 * Every real attempt is written to `SmsMessage` (delivery log) and, when the
 * app has a public https origin, Twilio is asked to POST delivery status to
 * /api/webhooks/twilio/status so the row advances to DELIVERED / FAILED.
 *
 * Suppression: a number that replied STOP (recorded on `SmsSubscriber`) is
 * never texted again from here, regardless of which caller asked — this is the
 * single choke point for TCPA opt-out honoring on top of Twilio's own
 * carrier-level Advanced Opt-Out.
 *
 * @module lib/sms/client
 */

import { logger } from '../logger'
import { prisma } from '../prisma'
import { toE164US } from './phone'
import { linkOutboundMessage } from './inbox-core'

const SMS_ENABLED = process.env.SMS_ENABLED === 'true'
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || ''
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ''
// Either a From number (E.164) or a Messaging Service SID may be configured.
// A2P 10DLC traffic must go through the Messaging Service the campaign is
// attached to, so the SID is the recommended (and production) setting.
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || ''
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || ''
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

/** Delivery-log categories (SmsMessage.kind). */
export const SMS_KINDS = [
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'ORDER_EXCEPTION',
  'INVOICE_OVERDUE',
  'OPT_IN_CONFIRMATION',
  'STAFF_REPLY',
  'OTHER',
] as const
export type SmsKind = (typeof SMS_KINDS)[number]

export interface SendSmsInput {
  to: string
  body: string
  /** Delivery-log category. Defaults to OTHER. */
  kind?: SmsKind
  /** Optional links for the delivery log (SmsMessage.orderId / clientId). */
  orderId?: string | null
  clientId?: string | null
  /** Staff member sending a manual reply from the inbox (SmsMessage.sentById). */
  sentById?: string | null
  /** Pre-resolved inbox thread; otherwise the row is threaded by phone number. */
  conversationId?: string | null
}

export type SendSmsSkipReason = 'disabled' | 'opted_out'

export interface SendSmsResult {
  ok: boolean
  skipped?: boolean
  /** Why a send was skipped (only when `skipped` is true). */
  reason?: SendSmsSkipReason
  sid?: string
  /** SmsMessage.id of the delivery-log row, when one was written. */
  messageId?: string
  error?: string
}

/** True only when the flag, credentials, and a sender are all configured. */
export function isSmsEnabled(): boolean {
  return Boolean(SMS_ENABLED && ACCOUNT_SID && AUTH_TOKEN && (FROM_NUMBER || MESSAGING_SERVICE_SID))
}

/**
 * Public URL Twilio should POST delivery-status updates to, or null when the
 * app has no public https origin (Twilio only calls back reachable URLs).
 */
export function smsStatusCallbackUrl(): string | null {
  if (!APP_URL.startsWith('https://')) return null
  return `${APP_URL}/api/webhooks/twilio/status`
}

/**
 * True when the number has an active STOP on file (SmsSubscriber.optedOutAt).
 * Fails open (false) when the DB is unavailable — Twilio's carrier-level
 * opt-out list is the second line of defense.
 */
export async function isPhoneOptedOut(phoneE164: string): Promise<boolean> {
  if (!prisma) return false
  try {
    const row = await prisma.smsSubscriber.findUnique({
      where: { phone: phoneE164 },
      select: { optedOutAt: true },
    })
    return Boolean(row?.optedOutAt)
  } catch (error) {
    logger.warn('SMS opt-out lookup failed (fail-open)', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

interface LogRowInput {
  phone: string
  body: string
  kind: SmsKind
  status: 'QUEUED' | 'FAILED' | 'SKIPPED'
  orderId?: string | null
  clientId?: string | null
  sentById?: string | null
  conversationId?: string | null
  twilioSid?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  sentAt?: Date | null
}

/**
 * Best-effort delivery-log write, threaded into the number's inbox
 * conversation so staff see automated texts alongside replies. Never throws.
 */
async function writeLogRow(input: LogRowInput): Promise<string | undefined> {
  if (!prisma) return undefined
  try {
    const row = await prisma.smsMessage.create({
      data: {
        phone: input.phone,
        direction: 'OUTBOUND',
        body: input.body,
        kind: input.kind,
        status: input.status,
        orderId: input.orderId ?? null,
        clientId: input.clientId ?? null,
        sentById: input.sentById ?? null,
        conversationId: input.conversationId ?? null,
        twilioSid: input.twilioSid ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        sentAt: input.sentAt ?? null,
      },
      select: { id: true },
    })
    await linkOutboundMessage({
      messageId: row.id,
      phone: input.phone,
      body: input.body,
      clientId: input.clientId ?? null,
      conversationId: input.conversationId ?? null,
      // A suppressed/failed attempt never reached the phone — keep it in the
      // thread for the audit trail but don't make it the "last message".
      touch: input.status === 'QUEUED',
    })
    return row.id
  } catch (error) {
    logger.warn('SMS delivery-log write failed (non-blocking)', {
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

/**
 * Send a single SMS via Twilio. Never throws — returns a result object so
 * callers (webhooks, crons, admin routes) can fire-and-forget without risking a
 * 500 if delivery fails. No-ops (skipped) when SMS is disabled, the number is
 * invalid, or the recipient has opted out.
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
  const kind: SmsKind = input.kind ?? 'OTHER'
  const links = {
    orderId: input.orderId ?? null,
    clientId: input.clientId ?? null,
    sentById: input.sentById ?? null,
    conversationId: input.conversationId ?? null,
  }

  // TCPA: honor STOP recorded on our side before anything else.
  if (await isPhoneOptedOut(to)) {
    logger.info('SMS suppressed — recipient opted out', { to, kind, ...links })
    const messageId = await writeLogRow({
      phone: to,
      body,
      kind,
      status: 'SKIPPED',
      ...links,
      errorMessage: 'Recipient opted out (STOP on file)',
    })
    return { ok: true, skipped: true, reason: 'opted_out', messageId }
  }

  if (!isSmsEnabled()) {
    logger.info('SMS disabled (set SMS_ENABLED=true + Twilio creds) — skipping', { to, kind, ...links })
    return { ok: true, skipped: true, reason: 'disabled' }
  }

  try {
    const params = new URLSearchParams({ To: to, Body: body })
    if (MESSAGING_SERVICE_SID) params.set('MessagingServiceSid', MESSAGING_SERVICE_SID)
    else params.set('From', FROM_NUMBER)
    const statusCallback = smsStatusCallbackUrl()
    if (statusCallback) params.set('StatusCallback', statusCallback)

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

    const data = (await res.json().catch(() => ({}))) as {
      sid?: string
      message?: string
      code?: number | string
    }
    if (!res.ok) {
      const error = data.message || `Twilio responded ${res.status}`
      const errorCode = data.code != null ? String(data.code) : null
      logger.error('SMS send failed', { to, kind, status: res.status, code: errorCode, error, ...links })
      const messageId = await writeLogRow({
        phone: to,
        body,
        kind,
        status: 'FAILED',
        ...links,
        errorCode,
        errorMessage: error,
      })
      return { ok: false, error, messageId }
    }

    logger.info('SMS sent', { to, kind, sid: data.sid, ...links })
    const messageId = await writeLogRow({
      phone: to,
      body,
      kind,
      status: 'QUEUED',
      ...links,
      twilioSid: data.sid ?? null,
      sentAt: new Date(),
    })
    return { ok: true, sid: data.sid, messageId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'send failed'
    logger.error(
      'SMS send failed',
      { to, kind, ...links },
      error instanceof Error ? error : new Error(String(error))
    )
    const messageId = await writeLogRow({
      phone: to,
      body,
      kind,
      status: 'FAILED',
      ...links,
      errorMessage: message,
    })
    return { ok: false, error: message, messageId }
  }
}
