/**
 * PeptSci Alerts — the SMS program registered with Twilio (A2P 10DLC).
 *
 * Every consent surface on peptsci.com (sign-up, Account → SMS Preferences,
 * the public /sms opt-in page) and the Terms of Service render from these
 * constants so the live site never drifts from the wording filed in the
 * campaign's MessageFlow / auto-replies. Changing any of these means the
 * campaign registration must be updated too.
 *
 * Dependency-free (only zod + the pure phone helper) so it is unit-testable and
 * safe to import from client components.
 *
 * @module lib/sms/program
 */

import { z } from 'zod'
import { toE164US } from './phone'

export const SMS_PROGRAM_NAME = 'PeptSci Alerts'
export const SMS_SUPPORT_EMAIL = 'support@peptsci.com'

/** Public opt-in page — the "sign up for texts" area linked from the footer. */
export const SMS_SIGNUP_PATH = '/sms'
/** Anchor of the SMS section inside the Terms of Service. */
export const SMS_TERMS_PATH = '/termsandconditions#sms'
/** Privacy Policy §7.2 (mobile data is not shared with third parties). */
export const SMS_PRIVACY_PATH = '/privacy'

/**
 * Exact checkbox label filed in the Twilio campaign (MessageFlow). Rendered
 * verbatim next to the phone field on registration, in Account Settings →
 * SMS Preferences, and on /sms. The trailing "Privacy Policy" / "Terms" are
 * linked in the UI (see components/sms/SmsConsentText).
 */
export const SMS_CONSENT_CHECKBOX_TEXT =
  'Text me order, shipping and account updates from PeptSci. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Consent is not a condition of purchase. See our Privacy Policy and Terms.'

/** Keywords registered on the campaign. */
export const SMS_OPT_IN_KEYWORDS = ['START', 'UNSTOP', 'YES'] as const
export const SMS_OPT_OUT_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'] as const
export const SMS_HELP_KEYWORDS = ['HELP', 'INFO'] as const

/** Auto-reply sent once when a subscriber opts in (web form or START). */
export const SMS_OPT_IN_CONFIRMATION = `${SMS_PROGRAM_NAME}: You're subscribed to order and account updates. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`

/** Auto-reply to STOP (Twilio sends this at the carrier level; mirrored here). */
export const SMS_OPT_OUT_CONFIRMATION = `You are unsubscribed from ${SMS_PROGRAM_NAME}. No more messages will be sent. Reply HELP for help.`

/** Auto-reply to HELP. */
export const SMS_HELP_MESSAGE = `${SMS_PROGRAM_NAME}: Help at ${SMS_SUPPORT_EMAIL}. Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel.`

/** Where a consent record originated (stored on SmsSubscriber.source). */
export const SMS_CONSENT_SOURCES = ['WEB_SMS_PAGE', 'SIGN_UP', 'ACCOUNT_SETTINGS', 'KEYWORD'] as const
export type SmsConsentSource = (typeof SMS_CONSENT_SOURCES)[number]

// ── Public /api/sms/subscribe input ──────────────────────────────────────────

export const smsSubscribeSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(7, 'Enter a valid mobile phone number')
    .max(30, 'Enter a valid mobile phone number')
    .transform((raw, ctx) => {
      const e164 = toE164US(raw)
      if (!e164) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid US mobile phone number' })
        return z.NEVER
      }
      return e164
    }),
  /** Must be an explicit true — the box is never pre-checked and consent is never implied. */
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Please check the box to consent to text messages' }),
  }),
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Enter a valid email address',
    }),
})

export type SmsSubscribeInput = z.output<typeof smsSubscribeSchema>

export type ParsedSmsSubscribe =
  | { ok: true; data: SmsSubscribeInput }
  | { ok: false; error: string }

/** Validates + normalizes a subscribe payload into a single human-readable error on failure. */
export function parseSmsSubscribeInput(input: unknown): ParsedSmsSubscribe {
  const parsed = smsSubscribeSchema.safeParse(input)
  if (parsed.success) return { ok: true, data: parsed.data }
  const first = parsed.error.errors[0]
  const field = first?.path[0]
  const message = first?.message ?? 'Invalid input'
  return { ok: false, error: field ? `${String(field)}: ${message}` : message }
}
