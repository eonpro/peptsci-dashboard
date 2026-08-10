/**
 * Pure (DB-free) helpers for per-client custom pricing CSV import.
 * Columns: sku, custom_price, optional notes.
 * Blank custom_price clears the override (clinic falls back to SRP).
 */

import { parseCsv } from './product-import'
import { parseLocaleNumber } from './csv-coerce'

export interface ClientPricingImportRow {
  rowNumber: number
  sku: string
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

export const CLIENT_PRICING_IMPORT_HEADERS = ['sku', 'custom_price', 'notes'] as const

type Field = 'sku' | 'customPrice' | 'notes'

function classifyHeader(raw: string): Field | undefined {
  const h = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!h) return undefined
  if (h === 'sku' || h === 'variant_sku' || h === 'product_sku' || h === 'item_sku') return 'sku'
  if (
    h === 'custom_price' ||
    h === 'customprice' ||
    h === 'offer_price' ||
    h === 'offerprice' ||
    h === 'price' ||
    h === 'client_price'
  )
    return 'customPrice'
  if (h === 'notes' || h === 'note' || h === 'price_notes') return 'notes'
  return undefined
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

  const seenSkus = new Set<string>()

  for (let r = 1; r < matrix.length; r++) {
    const rowNumber = r + 1
    const cols = matrix[r]
    const rowErrors: string[] = []

    const sku = cell(cols, 'sku') || ''
    const priceRaw = cell(cols, 'customPrice')
    const notesRaw = cell(cols, 'notes')
    const notes = notesRaw || undefined

    if (!sku) rowErrors.push('sku is required')
    if (sku && seenSkus.has(sku.toLowerCase())) {
      rowErrors.push(`duplicate sku "${sku}" within file`)
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

    seenSkus.add(sku.toLowerCase())
    rows.push({
      rowNumber,
      sku,
      customPrice,
      notes,
      clear,
    })
  }

  return { rows, errors }
}

/** CSV template text (header + one example row) for the download button. */
export function clientPricingImportTemplate(): string {
  const header = CLIENT_PRICING_IMPORT_HEADERS.join(',')
  const example = ['BPC-157-10', '45.00', 'Clinic offer'].join(',')
  return `${header}\n${example}\n`
}
