/**
 * Pure (DB-free) helpers for supplier price-list CSV import. Mirrors
 * lib/product-import.ts conventions. Rows map to the SupplierPriceItem model.
 *
 * Designed to accept manufacturer sheets as-is (e.g. Crest Peptide's
 * "Cat.No, Name, Specification, Vials Per Box, New Box Price (USD),
 * New Box Price -10% (USD), New Per-Vial (USD), New Per-Vial -10% (USD)").
 * Discounted columns ("-10%") are treated as our negotiated cost; list
 * columns are kept for reference.
 */

import { parseCsv } from './product-import'
import { parseLocaleNumber } from './csv-coerce'

export interface SupplierPriceRow {
  rowNumber: number
  /** Supplier's catalog number / SKU (e.g. "SM5"). */
  supplierSku: string
  productName: string
  dose?: string
  vialsPerBox?: number
  /** Per-vial cost we actually pay (discounted column when present). */
  unitCost: number
  /** Per-vial list price before discount, when the sheet carries one. */
  listPrice?: number
}

export interface RowError {
  rowNumber: number
  message: string
}

export interface SupplierParseResult {
  rows: SupplierPriceRow[]
  errors: RowError[]
}

/** Canonical header set for the downloadable template (Crest-style sheet). */
export const SUPPLIER_IMPORT_HEADERS = [
  'Cat.No',
  'Name',
  'Specification',
  'Vials Per Box',
  'New Box Price (USD)',
  'New Box Price -10% (USD)',
  'New Per-Vial (USD)',
  'New Per-Vial -10% (USD)',
] as const

type Field =
  | 'supplierSku'
  | 'productName'
  | 'dose'
  | 'vialsPerBox'
  | 'boxPrice'
  | 'boxPriceDiscounted'
  | 'perVial'
  | 'perVialDiscounted'
  | 'unitCost'

/**
 * Classify a raw header cell into a known field. Uses keyword matching rather
 * than exact aliases so supplier sheets with slightly different wording
 * ("Box Price -10% (USD)", "Discounted Per Vial") still map correctly.
 */
export function classifySupplierHeader(raw: string): Field | undefined {
  const h = raw.trim().toLowerCase()
  if (!h) return undefined

  // Catalog number / SKU
  if (/^cat\.?\s*no\.?$/.test(h) || h === 'sku' || h === 'supplier sku' || h === 'suppliersku')
    return 'supplierSku'
  if (h === 'catalog #' || h === 'catalog number' || h === 'item code' || h === 'code')
    return 'supplierSku'

  // Product name
  if (h === 'name' || h === 'product' || h === 'product name' || h === 'productname' || h === 'peptide')
    return 'productName'

  // Dose / specification
  if (h === 'specification' || h === 'spec' || h === 'dose' || h === 'strength' || h === 'size')
    return 'dose'

  // Vials per box
  if (/vials?\s*(per|\/)\s*box/.test(h) || h === 'box qty' || h === 'qty per box')
    return 'vialsPerBox'

  const discounted = /-\s*\d+\s*%|discount/.test(h)

  // Box price
  if (/box\s*price|price\s*(per|\/)\s*box/.test(h)) {
    return discounted ? 'boxPriceDiscounted' : 'boxPrice'
  }

  // Per-vial price
  if (/per[\s-]*vial|vial\s*price|price\s*(per|\/)\s*vial/.test(h)) {
    return discounted ? 'perVialDiscounted' : 'perVial'
  }

  // Direct cost column ("unit cost", "cost", "our cost")
  if (h === 'unit cost' || h === 'unitcost' || h === 'cost' || h === 'our cost')
    return 'unitCost'

  return undefined
}

const toNumber = parseLocaleNumber

/** Parse supplier price-list CSV text into validated rows + per-row errors. */
export function parseSupplierPriceCsv(input: string): SupplierParseResult {
  const matrix = parseCsv(input)
  const errors: RowError[] = []
  const rows: SupplierPriceRow[] = []

  if (matrix.length === 0) {
    return { rows, errors: [{ rowNumber: 1, message: 'File is empty' }] }
  }

  const header = matrix[0]
  const colIndex: Partial<Record<Field, number>> = {}
  header.forEach((h, idx) => {
    const field = classifySupplierHeader(h)
    if (field && colIndex[field] === undefined) colIndex[field] = idx
  })

  const missing = (['supplierSku', 'productName'] as const).filter(
    (f) => colIndex[f] === undefined
  )
  if (missing.length > 0) {
    const label = { supplierSku: 'Cat.No / SKU', productName: 'Name / Product' }
    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column(s): ${missing.map((f) => label[f]).join(', ')}. Expected headers like: ${SUPPLIER_IMPORT_HEADERS.join(', ')}`,
        },
      ],
    }
  }
  const hasPriceColumn =
    colIndex.unitCost !== undefined ||
    colIndex.perVialDiscounted !== undefined ||
    colIndex.perVial !== undefined ||
    colIndex.boxPriceDiscounted !== undefined ||
    colIndex.boxPrice !== undefined
  if (!hasPriceColumn) {
    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `Missing a price column (per-vial, box price, or unit cost). Expected headers like: ${SUPPLIER_IMPORT_HEADERS.join(', ')}`,
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
  const num = (cols: string[], field: Field): number | undefined => {
    const n = toNumber(cell(cols, field))
    return n === undefined || Number.isNaN(n) ? undefined : n
  }

  const seenSkus = new Set<string>()

  for (let r = 1; r < matrix.length; r++) {
    const rowNumber = r + 1
    const cols = matrix[r]
    const rowErrors: string[] = []

    const supplierSku = cell(cols, 'supplierSku') || ''
    const productName = cell(cols, 'productName') || ''
    const dose = cell(cols, 'dose') || undefined
    const vialsPerBoxRaw = num(cols, 'vialsPerBox')
    const vialsPerBox =
      vialsPerBoxRaw !== undefined && vialsPerBoxRaw > 0 ? Math.trunc(vialsPerBoxRaw) : undefined

    const boxPrice = num(cols, 'boxPrice')
    const boxPriceDiscounted = num(cols, 'boxPriceDiscounted')
    const perVial = num(cols, 'perVial')
    const perVialDiscounted = num(cols, 'perVialDiscounted')
    const directCost = num(cols, 'unitCost')

    // Effective per-vial cost: prefer explicit cost, then the discounted
    // per-vial column, then list per-vial, then box price / vials-per-box.
    const fromBox = (box: number | undefined): number | undefined =>
      box !== undefined && vialsPerBox ? box / vialsPerBox : undefined
    const unitCost =
      directCost ??
      perVialDiscounted ??
      perVial ??
      fromBox(boxPriceDiscounted) ??
      fromBox(boxPrice)

    // Per-vial list price (pre-discount) kept for reference when available.
    const listPriceRaw = perVial ?? fromBox(boxPrice)
    // Only meaningful when it differs from (i.e. exceeds) the effective cost.
    const listPrice =
      listPriceRaw !== undefined && unitCost !== undefined && listPriceRaw > unitCost
        ? listPriceRaw
        : undefined

    if (!supplierSku) rowErrors.push('Cat.No / SKU is required')
    if (!productName) rowErrors.push('product name is required')
    if (supplierSku && seenSkus.has(supplierSku.toLowerCase()))
      rowErrors.push(`duplicate Cat.No "${supplierSku}" within file`)
    if (unitCost === undefined) rowErrors.push('a per-vial or box price is required')
    else if (unitCost < 0) rowErrors.push('price must be >= 0')

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join('; ') })
      continue
    }

    seenSkus.add(supplierSku.toLowerCase())
    rows.push({
      rowNumber,
      supplierSku,
      productName,
      dose,
      vialsPerBox,
      unitCost: Number((unitCost as number).toFixed(2)),
      listPrice: listPrice !== undefined ? Number(listPrice.toFixed(2)) : undefined,
    })
  }

  return { rows, errors }
}

/** CSV template text (header + one example row) for the download button. */
export function supplierImportTemplate(): string {
  const header = SUPPLIER_IMPORT_HEADERS.join(',')
  const example = ['TSM10', 'Tesamorelin', '10mg', '10', '175.00', '157.50', '17.50', '15.75'].join(
    ','
  )
  return `${header}\n${example}\n`
}
