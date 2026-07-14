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
  /** Undefined when the CSV cell is blank/absent — re-imports must not zero prices. */
  unitCost?: number
  srp?: number
  supplierName?: string
  supplierSku?: string
  inventoryOnHand?: number
  reorderLevel?: number
  // Scientific / reference data (stored on the parent Product)
  description?: string
  casNumber?: string
  molecularFormula?: string
  molecularWeight?: number
  pubchemCid?: string
  peptideLength?: number
  aka?: string
  monoisotopicMass?: number
  complexity?: number
  xlogp?: number
  hydrogenBondDonorCount?: number
  hydrogenBondAcceptorCount?: number
  rotatableBondCount?: number
  heavyAtomCount?: number
  intendedUse?: string
  safetySummary?: string
  /** Product photo URL (https://... or a site-relative /path). */
  imageUrl?: string
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
  'description',
  'casNumber',
  'molecularFormula',
  'molecularWeight',
  'pubchemCid',
  'peptideLength',
  'aka',
  'monoisotopicMass',
  'complexity',
  'xlogp',
  'hydrogenBondDonorCount',
  'hydrogenBondAcceptorCount',
  'rotatableBondCount',
  'heavyAtomCount',
  'intendedUse',
  'safetySummary',
  'imageUrl',
] as const

/** Header aliases -> canonical field name (all compared lower-cased, trimmed). */
const HEADER_ALIASES: Record<string, keyof ProductImportRow | 'name'> = {
  name: 'name',
  product: 'name',
  'product name': 'name',
  productname: 'name',
  peptide: 'name',
  'peptide name': 'name',
  sku: 'sku',
  'variant sku': 'sku',
  code: 'sku',
  'item code': 'sku',
  'product code': 'sku',
  dose: 'dose',
  strength: 'dose',
  mg: 'dose',
  milligrams: 'dose',
  miligrams: 'dose',
  category: 'category',
  unitcost: 'unitCost',
  'unit cost': 'unitCost',
  cost: 'unitCost',
  'our cost': 'unitCost',
  'cost/unit': 'unitCost',
  'cost per unit': 'unitCost',
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
  inventory: 'inventoryOnHand',
  'current inventory': 'inventoryOnHand',
  reorderlevel: 'reorderLevel',
  'reorder level': 'reorderLevel',
  // Scientific / reference data
  description: 'description',
  casnumber: 'casNumber',
  'cas number': 'casNumber',
  cas: 'casNumber',
  'cas #': 'casNumber',
  'cas no': 'casNumber',
  molecularformula: 'molecularFormula',
  'molecular formula': 'molecularFormula',
  formula: 'molecularFormula',
  molecularweight: 'molecularWeight',
  'molecular weight': 'molecularWeight',
  'molecular weight (g/mol)': 'molecularWeight',
  mw: 'molecularWeight',
  pubchemcid: 'pubchemCid',
  'pubchem cid': 'pubchemCid',
  cid: 'pubchemCid',
  peptidelength: 'peptideLength',
  'peptide length': 'peptideLength',
  aka: 'aka',
  'also known as': 'aka',
  synonyms: 'aka',
  monoisotopicmass: 'monoisotopicMass',
  'monoisotopic mass': 'monoisotopicMass',
  complexity: 'complexity',
  xlogp: 'xlogp',
  xlogp3: 'xlogp',
  hydrogenbonddonorcount: 'hydrogenBondDonorCount',
  'hydrogen bond donor count': 'hydrogenBondDonorCount',
  'h-bond donor count': 'hydrogenBondDonorCount',
  hydrogenbondacceptorcount: 'hydrogenBondAcceptorCount',
  'hydrogen bond acceptor count': 'hydrogenBondAcceptorCount',
  'h-bond acceptor count': 'hydrogenBondAcceptorCount',
  rotatablebondcount: 'rotatableBondCount',
  'rotatable bond count': 'rotatableBondCount',
  heavyatomcount: 'heavyAtomCount',
  'heavy atom count': 'heavyAtomCount',
  intendeduse: 'intendedUse',
  'intended use': 'intendedUse',
  safetysummary: 'safetySummary',
  'safety summary': 'safetySummary',
  lcss: 'safetySummary',
  'pubchem laboratory chemical safety summary (lcss)': 'safetySummary',
  'pubchem lcss': 'safetySummary',
  imageurl: 'imageUrl',
  'image url': 'imageUrl',
  image: 'imageUrl',
  'image link': 'imageUrl',
  photo: 'imageUrl',
  'photo url': 'imageUrl',
  picture: 'imageUrl',
  'product image': 'imageUrl',
  'product photo': 'imageUrl',
}

/**
 * Dose-column headers that imply a bare-number cell is in milligrams,
 * so "10" is normalized to "10mg".
 */
const MG_DOSE_HEADERS = new Set(['mg', 'milligrams', 'miligrams'])

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

  // Scientific numbers are reference data: a non-numeric value (e.g. "N/A")
  // is silently dropped instead of failing the row, so it never blocks the
  // commercial import.
  const lenientNumber = (raw: string | undefined): number | undefined => {
    const n = toNumber(raw)
    return n === undefined || Number.isNaN(n) ? undefined : n
  }
  const lenientInt = (raw: string | undefined): number | undefined => {
    const n = lenientNumber(raw)
    return n === undefined ? undefined : Math.trunc(n)
  }
  // Image URLs are reference data too: junk values like "N/A" are dropped
  // rather than failing the row. Accepts absolute http(s) URLs or /paths.
  const lenientUrl = (raw: string | undefined): string | undefined => {
    const v = (raw || '').trim()
    return /^(https?:\/\/|\/)/i.test(v) ? v : undefined
  }

  // When the dose column is literally "Milligrams"/"mg", a bare number like
  // "10" means "10mg" - normalize it so it displays consistently.
  const doseIdx = colIndex.dose
  const doseIsMg = doseIdx !== undefined && MG_DOSE_HEADERS.has(header[doseIdx])

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
    // unitCost and srp are optional; a blank/absent value stays undefined so a
    // partial re-import (e.g. stock-only) can never zero out existing catalog
    // prices. Only a present-but-non-numeric value is an error.
    let unitCostVal: number | undefined
    if (unitCost !== undefined) {
      if (Number.isNaN(unitCost)) rowErrors.push('unitCost must be a number')
      else if (unitCost < 0) rowErrors.push('unitCost must be >= 0')
      else unitCostVal = unitCost
    }
    let srpVal: number | undefined
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

    let dose = cell(cols, 'dose') || undefined
    if (dose && doseIsMg && /^\d+(\.\d+)?$/.test(dose)) dose = `${dose}mg`

    rows.push({
      rowNumber,
      name,
      sku,
      dose,
      category: cell(cols, 'category') || undefined,
      unitCost: unitCostVal,
      srp: srpVal,
      supplierName: cell(cols, 'supplierName') || undefined,
      supplierSku: cell(cols, 'supplierSku') || undefined,
      inventoryOnHand: inventoryOnHand,
      reorderLevel: reorderLevel,
      description: cell(cols, 'description') || undefined,
      casNumber: cell(cols, 'casNumber') || undefined,
      molecularFormula: cell(cols, 'molecularFormula') || undefined,
      molecularWeight: lenientNumber(cell(cols, 'molecularWeight')),
      pubchemCid: cell(cols, 'pubchemCid') || undefined,
      peptideLength: lenientInt(cell(cols, 'peptideLength')),
      aka: cell(cols, 'aka') || undefined,
      monoisotopicMass: lenientNumber(cell(cols, 'monoisotopicMass')),
      complexity: lenientNumber(cell(cols, 'complexity')),
      xlogp: lenientNumber(cell(cols, 'xlogp')),
      hydrogenBondDonorCount: lenientInt(cell(cols, 'hydrogenBondDonorCount')),
      hydrogenBondAcceptorCount: lenientInt(cell(cols, 'hydrogenBondAcceptorCount')),
      rotatableBondCount: lenientInt(cell(cols, 'rotatableBondCount')),
      heavyAtomCount: lenientInt(cell(cols, 'heavyAtomCount')),
      intendedUse: cell(cols, 'intendedUse') || undefined,
      safetySummary: cell(cols, 'safetySummary') || undefined,
      imageUrl: lenientUrl(cell(cols, 'imageUrl')),
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
    'Growth-hormone-releasing hormone (GHRH) analog',
    '218949-48-5',
    'C221H366N72O67S',
    '5135.9',
    '44147413',
    '44',
    'TH9507; Egrifta',
    '5132.7',
    '11400',
    '-14.4',
    '73',
    '75',
    '182',
    '361',
    'Research use only',
    'See PubChem LCSS',
    'https://example.com/images/tesamorelin-vial.jpg',
  ].join(',')
  return `${header}\n${example}\n`
}
