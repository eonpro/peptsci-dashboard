import Link from 'next/link'
import {
  SMS_CONSENT_CHECKBOX_TEXT,
  SMS_PRIVACY_PATH,
  SMS_TERMS_PATH,
} from '@/lib/sms/program'

interface SmsConsentTextProps {
  /** Classes for the inline Privacy Policy / Terms links. */
  linkClassName?: string
}

const PRIVACY = 'Privacy Policy'
const TERMS = 'Terms'

/**
 * The exact SMS consent sentence filed with the Twilio campaign, rendered with
 * "Privacy Policy" and "Terms" as links. Every checkbox surface (sign-up,
 * Account → SMS Preferences, /sms) uses this so the text never diverges from
 * the registration (Twilio error 30909).
 */
export function SmsConsentText({ linkClassName = 'underline' }: SmsConsentTextProps) {
  // Split "… See our Privacy Policy and Terms." into linkable pieces without
  // duplicating the copy (the constant stays the single source of truth).
  const privacyAt = SMS_CONSENT_CHECKBOX_TEXT.lastIndexOf(PRIVACY)
  const termsAt = SMS_CONSENT_CHECKBOX_TEXT.lastIndexOf(TERMS)
  if (privacyAt === -1 || termsAt === -1 || termsAt < privacyAt) {
    return <>{SMS_CONSENT_CHECKBOX_TEXT}</>
  }
  const before = SMS_CONSENT_CHECKBOX_TEXT.slice(0, privacyAt)
  const between = SMS_CONSENT_CHECKBOX_TEXT.slice(privacyAt + PRIVACY.length, termsAt)
  const after = SMS_CONSENT_CHECKBOX_TEXT.slice(termsAt + TERMS.length)

  return (
    <>
      {before}
      <Link href={SMS_PRIVACY_PATH} className={linkClassName} target="_blank" rel="noopener">
        {PRIVACY}
      </Link>
      {between}
      <Link href={SMS_TERMS_PATH} className={linkClassName} target="_blank" rel="noopener">
        {TERMS}
      </Link>
      {after}
    </>
  )
}
