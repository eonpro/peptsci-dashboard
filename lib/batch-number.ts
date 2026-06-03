/**
 * Pure, dependency-free batch-number + barcode-payload helpers.
 *
 * Batch number format (confirmed with the business):
 *   <FIRST 3 LETTERS OF PRODUCT NAME><MG NUMBER>-<BUD MONTH><BUD YEAR>
 *
 * Example: Tesamorelin, 10mg, BUD 2027-07-11  ->  "TES10-072027"
 *
 * Kept free of Prisma/Clerk imports so it is unit-testable and reusable by the
 * intake service, the label engine, and any future importer. Uniqueness (the
 * numeric collision suffix) is applied by the caller via {@link withCollisionSuffix}.
 */

export interface BatchNumberInput {
  /** Product name, e.g. "Tesamorelin". */
  name: string
  /** Dose string containing the milligram amount, e.g. "10mg" or "2.5mg". */
  dose: string
  /** Beyond-Use Date as a Date or "YYYY-MM-DD" string. */
  bud: Date | string
}

/** Parsed calendar parts of a BUD, all zero-padded strings. */
export interface BudParts {
  month: string // MM
  day: string // DD
  year: string // YYYY
}

/**
 * Parse a BUD into calendar parts without timezone drift. Accepts a Date or a
 * "YYYY-MM-DD" / "MM-DD-YYYY" / "MM/DD/YYYY" string.
 */
export function parseBudParts(bud: Date | string): BudParts {
  if (bud instanceof Date) {
    if (Number.isNaN(bud.getTime())) {
      throw new Error('Invalid BUD date')
    }
    return {
      month: String(bud.getUTCMonth() + 1).padStart(2, '0'),
      day: String(bud.getUTCDate()).padStart(2, '0'),
      year: String(bud.getUTCFullYear()),
    }
  }

  const v = bud.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (iso) {
    return { year: iso[1], month: iso[2], day: iso[3] }
  }
  const us = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(v)
  if (us) {
    return { month: us[1], day: us[2], year: us[3] }
  }
  // Last resort: let Date try, normalized to UTC.
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid BUD date: ${bud}`)
  }
  return {
    month: String(d.getUTCMonth() + 1).padStart(2, '0'),
    day: String(d.getUTCDate()).padStart(2, '0'),
    year: String(d.getUTCFullYear()),
  }
}

/**
 * First three alphabetic characters of the product name, uppercased and padded
 * with 'X' if the name has fewer than three letters.
 */
export function productPrefix(name: string): string {
  const letters = (name || '').replace(/[^a-zA-Z]/g, '').toUpperCase()
  return (letters + 'XXX').slice(0, 3)
}

/**
 * The milligram amount as digits only (decimal point removed for a clean code).
 * "10mg" -> "10", "2.5mg" -> "25", "100mg/mL" -> "100".
 */
export function doseCode(dose: string): string {
  const match = /[\d.]+/.exec(dose || '')
  if (!match) return '0'
  return match[0].replace(/\./g, '') || '0'
}

/**
 * Build the canonical (suffix-free) batch number. Uniqueness is the caller's
 * responsibility via {@link withCollisionSuffix}.
 */
export function buildBatchNumber(input: BatchNumberInput): string {
  const { month, year } = parseBudParts(input.bud)
  return `${productPrefix(input.name)}${doseCode(input.dose)}-${month}${year}`
}

/**
 * Given a base batch number and a 1-based attempt index, return the candidate
 * to try. The first attempt is the base itself; subsequent attempts append
 * "-2", "-3", ... so printed labels stay human-readable.
 */
export function withCollisionSuffix(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`
}

/**
 * The Code128 barcode payload for a batch. The barcode encodes the batch number
 * verbatim so a scan resolves directly to the batch.
 */
export function barcodePayload(batchNumber: string): string {
  return batchNumber.trim().toUpperCase()
}
