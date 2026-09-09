/**
 * Pure helpers for Twilio webhooks (inbound messages + delivery status).
 * No I/O, no Prisma — unit-tested in isolation. The route handlers in
 * app/api/webhooks/twilio/* do the DB work.
 *
 * Signature scheme (Twilio "Validating requests"): X-Twilio-Signature is
 * Base64(HMAC-SHA1(authToken, fullUrl + Σ sorted(key + value))) over the POST
 * form parameters. Because a proxy (Vercel) may present a different scheme/host
 * than the public URL Twilio actually requested, callers validate against a
 * small list of candidate URLs.
 *
 * @module lib/sms/twilio-webhook
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { SMS_HELP_KEYWORDS, SMS_OPT_IN_KEYWORDS, SMS_OPT_OUT_KEYWORDS } from './program'

/** Twilio error 21610: "Attempt to send to unsubscribed recipient". */
export const TWILIO_ERROR_RECIPIENT_OPTED_OUT = '21610'

export type TwilioParams = Record<string, string>

/** Compute the expected X-Twilio-Signature for `url` + form `params`. */
export function computeTwilioSignature(authToken: string, url: string, params: TwilioParams): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)
  return createHmac('sha1', authToken).update(data).digest('base64')
}

export interface ValidateTwilioSignatureInput {
  authToken: string
  /** Candidate full URLs (with query string) Twilio may have signed. */
  urls: string[]
  params: TwilioParams
  signature: string | null | undefined
}

/** Constant-time check of the header against every candidate URL. */
export function validateTwilioSignature(input: ValidateTwilioSignatureInput): boolean {
  if (!input.authToken || !input.signature) return false
  const provided = Buffer.from(input.signature, 'utf8')
  for (const url of input.urls) {
    const expected = Buffer.from(computeTwilioSignature(input.authToken, url, input.params), 'utf8')
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) return true
  }
  return false
}

/**
 * URLs to try when validating: the URL as received plus the same path/query
 * rebased onto the public origin (NEXT_PUBLIC_APP_URL), de-duplicated.
 */
export function twilioWebhookCandidateUrls(requestUrl: string, publicOrigin: string): string[] {
  const out = [requestUrl]
  const origin = (publicOrigin || '').replace(/\/$/, '')
  if (origin) {
    try {
      const u = new URL(requestUrl)
      const rebased = `${origin}${u.pathname}${u.search}`
      if (!out.includes(rebased)) out.push(rebased)
    } catch {
      // requestUrl not parseable — fall through with what we have
    }
  }
  return out
}

/** Flatten a parsed form body to string params (Twilio never sends files here). */
export function formDataToParams(fd: FormData): TwilioParams {
  const params: TwilioParams = {}
  fd.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value
  })
  return params
}

export type InboundKeyword = 'STOP' | 'START' | 'HELP'

/**
 * Classify an inbound body as a campaign keyword. Matches the whole message
 * (after trimming and stripping trailing punctuation), so "please stop texting
 * me" is NOT treated as STOP — Twilio's own Advanced Opt-Out applies the same
 * whole-message rule.
 */
export function classifyInboundKeyword(body: string | null | undefined): InboundKeyword | null {
  const word = (body ?? '')
    .trim()
    .replace(/[.!?]+$/, '')
    .toUpperCase()
  if (!word) return null
  if ((SMS_OPT_OUT_KEYWORDS as readonly string[]).includes(word)) return 'STOP'
  if ((SMS_OPT_IN_KEYWORDS as readonly string[]).includes(word)) return 'START'
  if ((SMS_HELP_KEYWORDS as readonly string[]).includes(word)) return 'HELP'
  return null
}

/** SmsMessage.status values. */
export type SmsMessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'UNDELIVERED' | 'FAILED' | 'SKIPPED'

/** Map Twilio's MessageStatus to our delivery-log status. */
export function mapTwilioMessageStatus(status: string | null | undefined): SmsMessageStatus | null {
  switch ((status ?? '').toLowerCase()) {
    case 'queued':
    case 'accepted':
    case 'scheduled':
    case 'sending':
      return 'QUEUED'
    case 'sent':
      return 'SENT'
    case 'delivered':
    case 'read':
      return 'DELIVERED'
    case 'undelivered':
      return 'UNDELIVERED'
    case 'failed':
    case 'canceled':
      return 'FAILED'
    default:
      return null
  }
}

const STATUS_RANK: Record<SmsMessageStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  UNDELIVERED: 2,
  FAILED: 2,
  // SKIPPED rows never went to Twilio; nothing should move them.
  SKIPPED: 99,
}

/**
 * Twilio status callbacks can arrive out of order; only move forward.
 * Terminal states (DELIVERED / UNDELIVERED / FAILED) are final.
 */
export function shouldApplyStatusTransition(current: string, next: SmsMessageStatus): boolean {
  const cur = STATUS_RANK[current as SmsMessageStatus]
  if (cur === undefined) return true
  if (cur >= 2) return false
  return STATUS_RANK[next] > cur
}
