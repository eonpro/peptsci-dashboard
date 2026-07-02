/**
 * Pure phone-number helpers for SMS. Normalizes loosely-formatted US numbers to
 * E.164 (+1XXXXXXXXXX), which is what Twilio requires. Dependency-free so it can
 * be unit-tested in isolation and reused by the SMS client.
 *
 * @module lib/sms/phone
 */

/**
 * Normalize a phone string to E.164, assuming US (+1) when no country code is
 * present. Returns null when the input cannot be a valid US/E.164 number.
 *
 * Rules:
 *  - already `+<digits>` (8–15 digits): kept as-is
 *  - 10 digits: prefixed `+1`
 *  - 11 digits starting with `1`: prefixed `+`
 *  - anything else: null
 */
export function toE164US(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (trimmed.length === 0) return null

  // Already E.164-ish: leading + then 8–15 digits, no other characters.
  if (/^\+\d{8,15}$/.test(trimmed.replace(/[\s()-]/g, ''))) {
    return trimmed.replace(/[\s()-]/g, '')
  }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/** True when the value normalizes to a sendable E.164 number. */
export function isValidPhone(raw: string | null | undefined): boolean {
  return toE164US(raw) !== null
}
