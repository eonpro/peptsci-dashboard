/**
 * Dependency-free value coercion helpers shared by CSV importers.
 *
 * Previously these lived in lib/sheets.ts (Google Sheets parsing). They remain
 * useful for parsing user-uploaded CSVs (currency like "$1,234.50", integers,
 * and free-form dates), so they were extracted here when Sheets was removed.
 */

import { isValid } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

/** Parse a currency-ish string ("$1,234.50") into a number; 0 when blank/invalid. */
export function coerceCurrency(value: string | undefined | null): number {
  if (!value) return 0
  const cleaned = String(value).replace(/[$,]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/** Parse an integer string into a number; 0 when blank/invalid. */
export function coerceInt(value: string | undefined | null): number {
  if (!value) return 0
  const num = parseInt(String(value), 10)
  return isNaN(num) ? 0 : num
}

/** Parse a free-form date string into a NY-zoned Date, or null when invalid. */
export function coerceDate(value: string | undefined | null): Date | null {
  if (!value) return null
  try {
    const date = new Date(String(value))
    if (isValid(date)) {
      return toZonedTime(date, 'America/New_York')
    }
  } catch {
    // fall through
  }
  return null
}
