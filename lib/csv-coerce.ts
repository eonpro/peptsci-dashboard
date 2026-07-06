/**
 * Dependency-light value coercion helpers shared by CSV importers.
 *
 * Previously these lived in lib/sheets.ts (Google Sheets parsing). They remain
 * useful for parsing user-uploaded CSVs (currency like "$1,234.50", integers,
 * and free-form dates), so they were extracted here when Sheets was removed.
 */

import { isValid, parse } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'

/** The business operates on US Eastern calendar days. */
export const BUSINESS_TIME_ZONE = 'America/New_York'

/**
 * Locale-aware numeric coercion for CSV cells.
 *
 * Handles currency symbols and spaces, and detects the decimal separator by
 * the LAST occurrence of `.` vs `,` so both conventions parse correctly:
 *   "1,234.56" -> 1234.56   (US: comma thousands, dot decimal)
 *   "1.234,56" -> 1234.56   (EU: dot thousands, comma decimal)
 *   "$1 234,56" -> 1234.56
 *
 * Returns `undefined` for blank/null input and `NaN` when the value is
 * present but not a number (same contract callers already validate against).
 */
export function parseLocaleNumber(raw: string | undefined | null): number | undefined {
  if (raw == null) return undefined
  // Strip currency symbols, spaces (incl. NBSP), and any other non-numeric
  // characters, keeping digits, separators, and sign.
  let s = String(raw).replace(/[^0-9.,+-]/g, '')
  if (s === '' || s === '-' || s === '+') {
    return String(raw).trim() === '' ? undefined : NaN
  }

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot !== -1 && lastComma !== -1) {
    // Both separators present: the later one is the decimal separator, the
    // other is a thousands separator.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(/,/g, '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (lastComma !== -1) {
    // Comma only. A single comma followed by 1-2 digits is a decimal
    // separator ("12,5"); otherwise treat commas as thousands ("1,234").
    const decimals = s.length - lastComma - 1
    const commaCount = (s.match(/,/g) ?? []).length
    if (commaCount === 1 && decimals > 0 && decimals <= 2) {
      s = s.replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Parse a currency-ish string ("$1,234.50", "1.234,50 €") into a number; 0 when blank/invalid. */
export function coerceCurrency(value: string | undefined | null): number {
  const num = parseLocaleNumber(value)
  return num === undefined || Number.isNaN(num) ? 0 : num
}

/** Parse an integer string into a number; 0 when blank/invalid. */
export function coerceInt(value: string | undefined | null): number {
  if (!value) return 0
  const num = parseInt(String(value), 10)
  return isNaN(num) ? 0 : num
}

// Bare (time-less) date formats we accept, tried in order. MM/DD/YYYY is
// parsed unambiguously as month-first (this is a US business).
const BARE_DATE_FORMATS = ['yyyy-MM-dd', 'M/d/yyyy', 'M/d/yy', 'M-d-yyyy'] as const

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

/**
 * Parse a free-form date string, or null when invalid.
 *
 * Bare dates ("2026-01-15", "1/15/2026") are interpreted as America/New_York
 * calendar days — the returned Date is the UTC instant of NY midnight — not
 * as UTC midnight. Full timestamps keep their exact instant.
 */
export function coerceDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null

  for (const fmt of BARE_DATE_FORMATS) {
    const parsed = parse(raw, fmt, new Date())
    if (isValid(parsed)) {
      // `parse` yields server-local midnight; rebuild the same calendar day
      // as an NY-midnight instant.
      const day = `${pad(parsed.getFullYear(), 4)}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
      return fromZonedTime(`${day}T00:00:00`, BUSINESS_TIME_ZONE)
    }
  }

  // Fall back to native parsing for strings carrying a time component
  // (ISO timestamps, "Jan 15 2026 10:30", ...). Keep the exact instant.
  try {
    const date = new Date(raw)
    if (isValid(date)) return date
  } catch {
    // fall through
  }
  return null
}
