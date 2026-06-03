/**
 * Pure (DB-free) helpers for bulk product CSV import.
 *
 * Kept dependency-free and side-effect-free so it can be unit-tested and shared
 * between the API route and any scripts. The CSV parser implements the common
 * subset of RFC 4180 (quoted fields, escaped quotes, CRLF/LF, BOM).
 */

export interface ProductImportRow {
  /** 1-based row number in the source file (header = row 1). */
  rowNumber: number
  name: string
  sku: string
  dose?: string
  category?: string
  unitCost: number
  srp: number
  supplierName?: string
  supplierSku?: string
  inventoryOnHand?: number
  reorderLevel?: number
}

export interface RowError {
  rowNumber: number
  message: string
}

export interface ParseResult {
  rows: ProductImportRow[]
  errors: RowError[]
}

/** The canonical CSV header, in order, used for the downloadable template. */
export const PRODUCT_IMPORT_HEADERS = [
  'name',
  'sku',
  'dose',
  'category',
  'unitCost',
  'srp',
  'supplierName',
  'supplierSku',
  'inventoryOnHand',
  'reorderLevel',
] as const

/** Header aliases -> canonical field name (all compared lower-cased, trimmed). */
const HEADER_ALIASES: Record<string, keyof ProductImportRow | 'name'> = {
  name: 'name',
  product: 'name',
  'product name': 'name',
  productname: 'name',
  sku: 'sku',
  'variant sku': 'sku',
  code: 'sku',
  'item code': 'sku',
  'product code': 'sku',
  dose: 'dose',
  strength: 'dose',
  category: 'category',
  unitcost: 'unitCost',
  'unit cost': 'unitCost',
  cost: 'unitCost',
  'our cost': 'unitCost',
  srp: 'srp',
  price: 'srp',
  retail: 'srp',
  'retail price': 'srp',
  suppliername: 'supplierName',
  'supplier name': 'supplierName',
  manufacturer: 'supplierName',
  supplier: 'supplierName',
  suppliersku: 'supplierSku',
  'supplier sku': 'supplierSku',
  'manufacturer sku': 'supplierSku',
  'catalog #': 'supplierSku',
  'catalog number': 'supplierSku',
  inventoryonhand: 'inventoryOnHand',
  'inventory on hand': 'inventoryOnHand',
  'on hand': 'inventoryOnHand',
  qty: 'inventoryOnHand',
  quantity: 'inventoryOnHand',
  reorderlevel: 'reorderLevel',
  'reorder level': 'reorderLevel',
}

/**
 * Parse CSV text into a matrix of string cells. Handles quoted fields with
 * embedded commas/newlines and "" escaped quotes. Strips a leading BOM.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }

    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      // ignore; handled by the following \n (or end of input below)
    } else {
      field += c
    }
  }
  // flush last field/row if there is any pending content
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // drop fully-empty trailing rows
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

function toNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined
  const cleaned = raw.replace(/[$,\s]/g, '').trim()
  if (cleaned === '') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Map raw CSV text into validated ProductImportRow[] plus per-row errors.
 * Required per row: name, sku, unitCost, srp.
 */
export function parseProductCsv(input: string): ParseResult {
  const matrix = parseCsv(input)
  const errors: RowError[] = []
  const rows: ProductImportRow[] = []

  if (matrix.length === 0) {
    return { rows, errors: [{ rowNumber: 1, message: 'File is empty' }] }
  }

  const header = matrix[0].map((h) => h.trim().toLowerCase())
  const colIndex: Partial<Record<keyof ProductImportRow, number>> = {}
  header.forEach((h, idx) => {
    const field = HEADER_ALIASES[h]
    if (field && field !== 'rowNumber') {
      // first match wins
      if (colIndex[field as keyof ProductImportRow] === undefined) {
        colIndex[field as keyof ProductImportRow] = idx
      }
    }
  })

  const missing = (['name', 'sku'] as const).filter((f) => colIndex[f] === undefined)
  if (missing.length > 0) {
    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column(s): ${missing.join(', ')}. Expected headers like: ${PRODUCT_IMPORT_HEADERS.join(', ')}`,
        },
      ],
    }
  }

  const cell = (cols: string[], field: keyof ProductImportRow): string | undefined => {
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

    const name = cell(cols, 'name') || ''
    const sku = cell(cols, 'sku') || ''
    const unitCost = toNumber(cell(cols, 'unitCost'))
    const srp = toNumber(cell(cols, 'srp'))
    const inventoryOnHand = toNumber(cell(cols, 'inventoryOnHand'))
    const reorderLevel = toNumber(cell(cols, 'reorderLevel'))

    if (!name) rowErrors.push('name is required')
    if (!sku) rowErrors.push('sku is required')
    if (sku && seenSkus.has(sku.toLowerCase()))
      rowErrors.push(`duplicate sku "${sku}" within file`)
    // unitCost and srp are optional; a blank/absent value defaults to 0. Only a
    // present-but-non-numeric value is an error (supports cost-only catalogs).
    let unitCostVal = 0
    if (unitCost !== undefined) {
      if (Number.isNaN(unitCost)) rowErrors.push('unitCost must be a number')
      else if (unitCost < 0) rowErrors.push('unitCost must be >= 0')
      else unitCostVal = unitCost
    }
    let srpVal = 0
    if (srp !== undefined) {
      if (Number.isNaN(srp)) rowErrors.push('srp must be a number')
      else if (srp < 0) rowErrors.push('srp must be >= 0')
      else srpVal = srp
    }
    if (inventoryOnHand !== undefined && (Number.isNaN(inventoryOnHand) || inventoryOnHand < 0))
      rowErrors.push('inventoryOnHand must be a non-negative number')
    if (reorderLevel !== undefined && (Number.isNaN(reorderLevel) || reorderLevel < 0))
      rowErrors.push('reorderLevel must be a non-negative number')

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join('; ') })
      continue
    }

    seenSkus.add(sku.toLowerCase())
    rows.push({
      rowNumber,
      name,
      sku,
      dose: cell(cols, 'dose') || undefined,
      category: cell(cols, 'category') || undefined,
      unitCost: unitCostVal,
      srp: srpVal,
      supplierName: cell(cols, 'supplierName') || undefined,
      supplierSku: cell(cols, 'supplierSku') || undefined,
      inventoryOnHand: inventoryOnHand,
      reorderLevel: reorderLevel,
    })
  }

  return { rows, errors }
}

/** CSV template text (header + one example row) for the download button. */
export function productImportTemplate(): string {
  const header = PRODUCT_IMPORT_HEADERS.join(',')
  const example = [
    'Tesamorelin',
    'TES-10',
    '10mg',
    'Peptides',
    '45.00',
    '129.00',
    'Acme Peptides Inc',
    'ACME-TES-10',
    '0',
    '5',
  ].join(',')
  return `${header}\n${example}\n`
}
