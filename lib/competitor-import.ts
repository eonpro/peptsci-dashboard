/**
 * Pure (DB-free) helpers for competitor price CSV import. Mirrors
 * lib/product-import.ts conventions. Columns map to the CompetitorPrice model.
 * Required per row: competitor, product, theirPrice, ourSrp.
 */

import { parseCsv } from './product-import'
import { parseLocaleNumber } from './csv-coerce'

export interface CompetitorImportRow {
  rowNumber: number
  competitor: string
  product: string
  dose?: string
  theirPrice: number
  ourSrp: number
  diff?: number
}

export interface RowError {
  rowNumber: number
  message: string
}

export interface CompetitorParseResult {
  rows: CompetitorImportRow[]
  errors: RowError[]
}

type Field = keyof Omit<CompetitorImportRow, 'rowNumber'>

export const COMPETITOR_IMPORT_HEADERS = [
  'competitor',
  'product',
  'dose',
  'theirPrice',
  'ourSrp',
  'diff',
] as const

const HEADER_ALIASES: Record<string, Field> = {
  competitor: 'competitor',
  'competitor name': 'competitor',
  competitorname: 'competitor',
  vendor: 'competitor',
  product: 'product',
  'product name': 'product',
  productname: 'product',
  name: 'product',
  dose: 'dose',
  strength: 'dose',
  theirprice: 'theirPrice',
  'their price': 'theirPrice',
  'competitor price': 'theirPrice',
  'their srp': 'theirPrice',
  oursrp: 'ourSrp',
  'our srp': 'ourSrp',
  'our price': 'ourSrp',
  srp: 'ourSrp',
  diff: 'diff',
  difference: 'diff',
}

// Locale-aware ("1,234.56" and "1.234,56" both parse): see lib/csv-coerce.ts.
const toNumber = parseLocaleNumber

export function parseCompetitorCsv(input: string): CompetitorParseResult {
  const matrix = parseCsv(input)
  const errors: RowError[] = []
  const rows: CompetitorImportRow[] = []

  if (matrix.length === 0) {
    return { rows, errors: [{ rowNumber: 1, message: 'File is empty' }] }
  }

  const header = matrix[0].map((h) => h.trim().toLowerCase())
  const colIndex: Partial<Record<Field, number>> = {}
  header.forEach((h, idx) => {
    const field = HEADER_ALIASES[h]
    if (field && colIndex[field] === undefined) colIndex[field] = idx
  })

  const missing = (['competitor', 'product'] as const).filter((f) => colIndex[f] === undefined)
  if (missing.length > 0) {
    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column(s): ${missing.join(', ')}. Expected headers like: ${COMPETITOR_IMPORT_HEADERS.join(', ')}`,
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

  const seen = new Set<string>()

  for (let r = 1; r < matrix.length; r++) {
    const rowNumber = r + 1
    const cols = matrix[r]
    const rowErrors: string[] = []

    const competitor = cell(cols, 'competitor') || ''
    const product = cell(cols, 'product') || ''
    const dose = cell(cols, 'dose') || ''
    const theirPrice = toNumber(cell(cols, 'theirPrice'))
    const ourSrp = toNumber(cell(cols, 'ourSrp'))
    const diff = toNumber(cell(cols, 'diff'))

    if (!competitor) rowErrors.push('competitor is required')
    if (!product) rowErrors.push('product is required')
    if (theirPrice === undefined) rowErrors.push('theirPrice is required')
    else if (Number.isNaN(theirPrice)) rowErrors.push('theirPrice must be a number')
    if (ourSrp === undefined) rowErrors.push('ourSrp is required')
    else if (Number.isNaN(ourSrp)) rowErrors.push('ourSrp must be a number')
    if (diff !== undefined && Number.isNaN(diff)) rowErrors.push('diff must be a number')

    const key = `${competitor.toLowerCase()}|${product.toLowerCase()}|${dose.toLowerCase()}`
    if (competitor && product && seen.has(key))
      rowErrors.push(`duplicate (competitor, product, dose) within file`)

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join('; ') })
      continue
    }

    seen.add(key)
    rows.push({
      rowNumber,
      competitor,
      product,
      dose: dose || undefined,
      theirPrice: theirPrice as number,
      ourSrp: ourSrp as number,
      diff: diff !== undefined && !Number.isNaN(diff) ? diff : undefined,
    })
  }

  return { rows, errors }
}

export function competitorImportTemplate(): string {
  const header = COMPETITOR_IMPORT_HEADERS.join(',')
  const example = ['CompoundingRx', 'Semaglutide', '10mg', '450.00', '399.00', ''].join(',')
  return `${header}\n${example}\n`
}
