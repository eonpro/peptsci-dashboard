/**
 * Heading → anchor helpers for the markdown legal pages.
 *
 * `## 14. SMS TERMS {#sms}` renders as "14. SMS TERMS" with `id="sms"`, so
 * external references (the Twilio campaign, emails, the opt-in checkbox) can
 * deep-link to /termsandconditions#sms. Headings without an override get a
 * slug of their text minus the leading section number.
 */

const OVERRIDE_RE = /\s*\{#([a-z0-9][a-z0-9-]*)\}\s*$/i

/** Display text for a heading (explicit `{#id}` removed). */
export function stripHeadingAnchor(text: string): string {
  return text.replace(OVERRIDE_RE, '').trim()
}

/** Anchor id for a heading, or undefined when the text is empty. */
export function headingAnchorId(text: string): string | undefined {
  const override = text.match(OVERRIDE_RE)
  if (override) return override[1].toLowerCase()
  const slug = text
    .replace(/^\s*\d+(\.\d+)*\.?\s+/, '') // "7.2 " / "14. " section numbers
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || undefined
}
