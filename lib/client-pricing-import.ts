/**
 * Pure (DB-free) helpers for per-client custom pricing CSV import.
 *
 * Expected columns (clinic offer sheets):
 *   sku, Strength, custom_price
 *
 * `sku` is the product name (e.g. Semaglutide) — the same name may appear on
 * multiple rows with different Strengths. Blank custom_price clears the
 * override (clinic falls back to SRP). Optional `notes` is still accepted.
 */

import { parseCsv } from './product-import'
import { parseLocaleNumber } from './csv-coerce'

export interface ClientPricingImportRow {
  rowNumber: number
  /** Product name as supplied in the sku column (or a real catalog SKU). */
  sku: string
  /** Dose / strength (e.g. 5mg, 10iu). Required for name+strength matching. */
  strength: string
  /** Positive price to set, or null to clear the custom override. */
  customPrice: number | null
  notes?: string
  /** True when the row intentionally clears pricing (blank custom_price). */
  clear: boolean
}

export interface RowError {
  rowNumber: number
  message: string
}

export interface ClientPricingParseResult {
  rows: ClientPricingImportRow[]
  errors: RowError[]
}

/** Canonical headers matching clinic offer sheets. */
export const CLIENT_PRICING_IMPORT_HEADERS = ['sku', 'Strength', 'custom_price'] as const

type Field = 'sku' | 'strength' | 'customPrice' | 'notes'

function classifyHeader(raw: string): Field | undefined {
  // Strip BOM / odd whitespace Google Sheets sometimes embeds in headers.
  const h = raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (!h) return undefined
  if (
    h === 'sku' ||
    h === 'variant_sku' ||
    h === 'product_sku' ||
    h === 'item_sku' ||
    h === 'product' ||
    h === 'product_name' ||
    h === 'name' ||
    h === 'peptide'
  )
    return 'sku'
  if (
    h === 'strength' ||
    h === 'dose' ||
    h === 'size' ||
    h === 'specification' ||
    h === 'mg' ||
    h === 'milligram' ||
    h === 'milligrams' ||
    h === 'dosage' ||
    h === 'amount' ||
    h === 'unit_size'
  )
    return 'strength'
  if (
    h === 'custom_price' ||
    h === 'customprice' ||
    h === 'offer_price' ||
    h === 'offerprice' ||
    h === 'price' ||
    h === 'client_price' ||
    h === 'agreed_price' ||
    h === 'clinic_price'
  )
    return 'customPrice'
  if (h === 'notes' || h === 'note' || h === 'price_notes') return 'notes'
  return undefined
}

/**
 * Normalize dose/strength for matching ("5 mg" / "5.0mg" → "5mg").
 * Kept local (not imported from label PDF helpers) so this module stays
 * browser-safe for ClientPricingPanel preview parsing.
 */
export function normalizeClientPricingDose(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return `${Number(trimmed)}mg`
  return trimmed
    .replace(
      /(\d+(?:\.\d+)?)\s*(mg|mcg|iu|ml|g)\b/gi,
      (_m, num: string, unit: string) => `${Number(num)}${unit.toLowerCase()}`
    )
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** Case/whitespace-normalized product name. */
export function normalizeClientPricingProduct(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Alphanumeric-only key for fuzzy name match (AOD 9604 ≈ AOD-9604). */
export function looseClientPricingProduct(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Parse client custom-pricing CSV into validated rows + per-row errors. */
export function parseClientPricingCsv(input: string): ClientPricingParseResult {
  const matrix = parseCsv(input)
  const errors: RowError[] = []
  const rows: ClientPricingImportRow[] = []

  if (matrix.length === 0) {
    return { rows, errors: [{ rowNumber: 1, message: 'File is empty' }] }
  }

  const header = matrix[0]
  const colIndex: Partial<Record<Field, number>> = {}
  header.forEach((h, idx) => {
    const field = classifyHeader(h)
    if (field && colIndex[field] === undefined) colIndex[field] = idx
  })

  if (colIndex.sku === undefined) {
    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column: sku. Expected headers: ${CLIENT_PRICING_IMPORT_HEADERS.join(', ')}`,
        },
      ],
    }
  }
  if (colIndex.strength === undefined) {
    // Fallback: detect a column whose values look like doses (5mg, 10iu, …)
    // when the header is unlabeled / unexpected.
    const doseLike = /^\d+(?:\.\d+)?\s*(mg|mcg|iu|ml|g)?$/i
    for (let c = 0; c < header.length; c++) {
      if (Object.values(colIndex).includes(c)) continue
      let hits = 0
      let samples = 0
      for (let r = 1; r < Math.min(matrix.length, 25); r++) {
        const v = (matrix[r][c] || '').trim()
        if (!v) continue
        samples++
        if (doseLike.test(v)) hits++
      }
      if (samples >= 2 && hits / samples >= 0.7) {
        colIndex.strength = c
        break
      }
    }
  }

  if (colIndex.strength === undefined) {
    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column: Strength (mg / dose). Same product name can appear multiple times with different milligram amounts — include Strength so each row maps to the right vial. Expected headers: ${CLIENT_PRICING_IMPORT_HEADERS.join(', ')}`,
        },
      ],
    }
  }
  if (colIndex.customPrice === undefined) {
    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column: custom_price. Expected headers: ${CLIENT_PRICING_IMPORT_HEADERS.join(', ')}`,
        },
      ],
    }
  }

  const cell = (cols: string[], field: Field): string | undefined => {
    const idx = colIndex[field]
    if (idx === undefined) return undefined
    const v = cols[idx]
    return v === undefined ? undefined : v.trim()
  }

  const seenKeys = new Set<string>()

  for (let r = 1; r < matrix.length; r++) {
    const rowNumber = r + 1
    const cols = matrix[r]
    const rowErrors: string[] = []

    const sku = cell(cols, 'sku') || ''
    const strength = cell(cols, 'strength') || ''
    const priceRaw = cell(cols, 'customPrice')
    const notesRaw = cell(cols, 'notes')
    const notes = notesRaw || undefined

    if (!sku) rowErrors.push('sku is required')
    if (!strength) rowErrors.push('Strength is required')

    const dedupeKey = `${normalizeClientPricingProduct(sku)}::${normalizeClientPricingDose(strength)}`
    if (sku && strength && seenKeys.has(dedupeKey)) {
      rowErrors.push(`duplicate sku+Strength "${sku}" / "${strength}" within file`)
    }

    let customPrice: number | null = null
    let clear = false

    if (priceRaw === undefined || priceRaw === '') {
      clear = true
      customPrice = null
    } else {
      const n = parseLocaleNumber(priceRaw)
      if (n === undefined || Number.isNaN(n)) {
        rowErrors.push(`invalid custom_price "${priceRaw}"`)
      } else if (n <= 0) {
        rowErrors.push('custom_price must be greater than 0 (leave blank to clear)')
      } else {
        customPrice = Number(n.toFixed(2))
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join('; ') })
      continue
    }

    seenKeys.add(dedupeKey)
    rows.push({
      rowNumber,
      sku,
      strength,
      customPrice,
      notes,
      clear,
    })
  }

  return { rows, errors }
}

/** CSV template text (header + example rows) for the download button. */
export function clientPricingImportTemplate(): string {
  const header = CLIENT_PRICING_IMPORT_HEADERS.join(',')
  const examples = [
    ['Semaglutide', '5mg', '$30'].join(','),
    ['Semaglutide', '10mg', '$40'].join(','),
    ['Tirzepatide', '10mg', '$60'].join(','),
  ]
  return `${header}\n${examples.join('\n')}\n`
}
