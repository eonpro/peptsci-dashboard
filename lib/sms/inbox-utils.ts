/**
 * Pure helpers + request schemas for the SMS inbox (CRM). No I/O so they can
 * be unit-tested and shared by API routes and React components.
 *
 * @module lib/sms/inbox-utils
 */

import { z } from 'zod'

export const CONVERSATION_STATUSES = ['OPEN', 'CLOSED'] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export type MessageDirection = 'OUTBOUND' | 'INBOUND'

/** Twilio hard-caps a single message at 1600 chars; keep replies to ~5 segments. */
export const SMS_MAX_REPLY_LENGTH = 800

export const PREVIEW_LENGTH = 120

/** "+18132637844" → "(813) 263-7844"; other shapes are returned unchanged. */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return ''
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone)
  if (!m) return phone
  return `(${m[1]}) ${m[2]}-${m[3]}`
}

/** Single-line, whitespace-collapsed preview for list rows. */
export function messagePreview(body: string, max = PREVIEW_LENGTH): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

// GSM-7 basic character set (+ extension chars count double, approximated as
// non-GSM → unicode here for simplicity; the count is advisory only).
// eslint-disable-next-line no-control-regex
const GSM7 = /^[\u0000-\u007F£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/

export interface SmsSegmentInfo {
  chars: number
  segments: number
  unicode: boolean
}

/** Rough segment math so the composer can show "2 segments" like a phone does. */
export function smsSegmentInfo(body: string): SmsSegmentInfo {
  const chars = Array.from(body).length
  if (chars === 0) return { chars: 0, segments: 0, unicode: false }
  const unicode = !GSM7.test(body)
  const single = unicode ? 70 : 160
  const multi = unicode ? 67 : 153
  const segments = chars <= single ? 1 : Math.ceil(chars / multi)
  return { chars, segments, unicode }
}

export const conversationReplySchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(SMS_MAX_REPLY_LENGTH),
})

export const conversationPatchSchema = z
  .object({
    status: z.enum(CONVERSATION_STATUSES).optional(),
    assignedToId: z.string().min(1).nullable().optional(),
    clientId: z.string().min(1).nullable().optional(),
    contactName: z.string().trim().max(120).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' })

export type ConversationPatch = z.infer<typeof conversationPatchSchema>

const boolFromQuery = z.preprocess(
  (v) => v === true || v === '1' || v === 'true',
  z.boolean()
)

export const conversationListQuerySchema = z.object({
  status: z.enum([...CONVERSATION_STATUSES, 'ALL']).default('OPEN'),
  unread: boolFromQuery.default(false),
  mine: boolFromQuery.default(false),
  q: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v ? v : undefined)),
  clientId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>

/** Any inbound message pulls a thread back into the OPEN queue. */
export function nextConversationStatusAfterInbound(_current: string): ConversationStatus {
  return 'OPEN'
}

export function displayNameForStaff(
  u: { firstName: string | null; lastName: string | null; email: string | null } | null | undefined
): string {
  if (!u) return 'PeptSci'
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  return full || u.email || 'PeptSci'
}

export type ConsentState = 'SUBSCRIBED' | 'OPTED_OUT' | 'UNKNOWN'

/**
 * Consent summary for the thread header. STOP on file always wins; otherwise
 * either a subscriber row or the linked practice's smsOptIn flag counts.
 */
export function consentStateFor(
  subscriber: { optedOutAt: Date | null; consentedAt: Date | null } | null,
  clientOptIn: boolean
): ConsentState {
  if (subscriber?.optedOutAt) return 'OPTED_OUT'
  if (subscriber?.consentedAt || clientOptIn) return 'SUBSCRIBED'
  return 'UNKNOWN'
}
