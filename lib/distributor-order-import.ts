/**
 * Pure (DB-free) helpers for distributor purchase-order CSV import. Mirrors
 * lib/product-import.ts conventions. The CSV is flat: one row per line item,
 * grouped into orders by `orderId`. Order-level fields (date, vendor, status,
 * shipping, paypalFee, tracking) are read from the first row of each group.
 *
 * Required per row: orderId, product, quantity.
 *
 * A spreadsheet "ledger" export is also auto-detected and supported (see
 * parseLedgerRows): a date row starts each order, product lines follow with
 * blank dates, and Shipping / Paypal Fee / subtotal rows are interleaved.
 */

import { parseCsv } from './product-import'
import { parseLocaleNumber } from './csv-coerce'

export interface DistributorLineRow {
  rowNumber: number
  orderId: string
  orderDate?: string
  vendor?: string
  status?: string
  trackingNumber?: string
  shipping?: number
  paypalFee?: number
  total?: number
  product: string
  dose?: string
  quantity: number
  unitCost: number
  lineTotal: number
}

export interface RowError {
  rowNumber: number
  message: string
}

export interface DistributorParseResult {
  rows: DistributorLineRow[]
  errors: RowError[]
}

export interface DistributorOrderImport {
  externalId: string
  orderDate?: string
  vendor: string
  status: string
  trackingNumber?: string
  shipping: number
  paypalFee: number
  subtotal: number
  total: number
  lines: {
    productName: string
    dose: string
    quantity: number
    unitCost: number
    lineTotal: number
  }[]
}

type Field = keyof Omit<DistributorLineRow, 'rowNumber'>

export const DISTRIBUTOR_IMPORT_HEADERS = [
  'orderId',
  'orderDate',
  'vendor',
  'status',
  'trackingNumber',
  'shipping',
  'paypalFee',
  'product',
  'dose',
  'quantity',
  'unitCost',
  'lineTotal',
] as const

const HEADER_ALIASES: Record<string, Field> = {
  orderid: 'orderId',
  'order id': 'orderId',
  order: 'orderId',
  po: 'orderId',
  'po #': 'orderId',
  orderdate: 'orderDate',
  'order date': 'orderDate',
  date: 'orderDate',
  vendor: 'vendor',
  supplier: 'vendor',
  distributor: 'vendor',
  status: 'status',
  trackingnumber: 'trackingNumber',
  'tracking number': 'trackingNumber',
  'tracking #': 'trackingNumber',
  shipping: 'shipping',
  'shipping cost': 'shipping',
  paypalfee: 'paypalFee',
  'paypal fee': 'paypalFee',
  fee: 'paypalFee',
  total: 'total',
  'order total': 'total',
  product: 'product',
  'product name': 'product',
  item: 'product',
  dose: 'dose',
  strength: 'dose',
  quantity: 'quantity',
  qty: 'quantity',
  'units #': 'quantity',
  units: 'quantity',
  unitcost: 'unitCost',
  'unit cost': 'unitCost',
  cost: 'unitCost',
  linetotal: 'lineTotal',
  'line total': 'lineTotal',
  'item total': 'lineTotal',
}

// Locale-aware ("1,234.56" and "1.234,56" both parse): see lib/csv-coerce.ts.
const toNumber = parseLocaleNumber

// ---------------------------------------------------------------------------
// Ledger-format support: spreadsheet exports where a date row starts each
// order, product lines follow with blank dates, and Shipping / Paypal Fee /
// subtotal rows are interleaved. Example header:
//   Date of Order, Total Order Amount, Products, Product dose, Amount,
//   Cost per item, Totals
// ---------------------------------------------------------------------------

type LedgerField = 'orderDate' | 'total' | 'product' | 'dose' | 'quantity' | 'unitCost' | 'lineTotal'

const LEDGER_ALIASES: Record<string, LedgerField> = {
  'date of order': 'orderDate',
  'order date': 'orderDate',
  date: 'orderDate',
  'total order amount': 'total',
  'order total': 'total',
  'total order': 'total',
  products: 'product',
  product: 'product',
  'product name': 'product',
  medication: 'product',
  medications: 'product',
  item: 'product',
  'product dose': 'dose',
  dose: 'dose',
  strength: 'dose',
  amount: 'quantity',
  quantity: 'quantity',
  // Common spreadsheet typo, seen in real exports.
  quanity: 'quantity',
  qty: 'quantity',
  units: 'quantity',
  'cost per item': 'unitCost',
  'unit cost': 'unitCost',
  price: 'unitCost',
  cost: 'unitCost',
  totals: 'lineTotal',
  'line total': 'lineTotal',
  total: 'lineTotal',
}

// Words that appear in the product column but are not products.
const LEDGER_SHIPPING = /^(shipping|freight|delivery)\b/i
const LEDGER_FEE = /paypal|processing fee|^fee(s)?$/i
const LEDGER_SUBHEADER = new Set(['medication', 'medications', 'product', 'products', 'item', 'items'])

function mapLedgerHeader(cells: string[]): Partial<Record<LedgerField, number>> | null {
  const map: Partial<Record<LedgerField, number>> = {}
  cells.forEach((raw, idx) => {
    const field = LEDGER_ALIASES[raw.trim().toLowerCase()]
    if (field && map[field] === undefined) map[field] = idx
  })
  const ok =
    map.orderDate !== undefined &&
    map.product !== undefined &&
    (map.lineTotal !== undefined || map.unitCost !== undefined)
  return ok ? map : null
}

/** Normalize "8/16/25" / "2025-08-16" into a stable id fragment. */
function ledgerDateKey(raw: string): string {
  const mdY = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (mdY) {
    const [, m, d, y] = mdY
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return raw.replace(/[^0-9A-Za-z]+/g, '-')
}

function parseLedgerRows(
  matrix: string[][],
  headerRowIdx: number,
  col: Partial<Record<LedgerField, number>>
): DistributorParseResult {
  interface LedgerOrder {
    orderId: string
    orderDate: string
    total?: number
    shipping?: number
    paypalFee?: number
    lines: { rowNumber: number; product: string; dose?: string; quantity: number; unitCost: number; lineTotal: number }[]
  }

  const errors: RowError[] = []
  const orders: LedgerOrder[] = []
  const idCounts = new Map<string, number>()
  let current: LedgerOrder | null = null

  const cell = (cols: string[], field: LedgerField): string => {
    const idx = col[field]
    if (idx === undefined) return ''
    return (cols[idx] ?? '').trim()
  }

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const rowNumber = r + 1
    const cols = matrix[r]
    const date = cell(cols, 'orderDate')
    const product = cell(cols, 'product')
    const orderTotal = toNumber(cell(cols, 'total'))
    const quantity = toNumber(cell(cols, 'quantity'))
    const unitCost = toNumber(cell(cols, 'unitCost'))
    const lineTotal = toNumber(cell(cols, 'lineTotal'))

    // Repeated header rows inside the sheet ("Medication, Dose, Quanity, ...").
    if (mapLedgerHeader(cols) && !date) continue

    if (date) {
      const key = ledgerDateKey(date)
      const seen = (idCounts.get(key) ?? 0) + 1
      idCounts.set(key, seen)
      current = {
        orderId: seen === 1 ? `PO-${key}` : `PO-${key}-${seen}`,
        orderDate: date,
        total: orderTotal !== undefined && !Number.isNaN(orderTotal) ? orderTotal : undefined,
        lines: [],
      }
      orders.push(current)
    }

    if (!product) continue // blank spacer rows and subtotal-only rows

    const lowered = product.toLowerCase()
    if (LEDGER_SUBHEADER.has(lowered)) continue

    if (!current) {
      errors.push({ rowNumber, message: `Line "${product}" appears before any order date row` })
      continue
    }

    const value =
      lineTotal !== undefined && !Number.isNaN(lineTotal)
        ? lineTotal
        : unitCost !== undefined && !Number.isNaN(unitCost)
          ? unitCost
          : undefined

    if (LEDGER_SHIPPING.test(product)) {
      if (value !== undefined) current.shipping = (current.shipping ?? 0) + value
      continue
    }
    if (LEDGER_FEE.test(product)) {
      // Fee rows carry the fee amount in the Totals column (the per-item cell
      // holds the rate, e.g. 0.05).
      if (lineTotal !== undefined && !Number.isNaN(lineTotal)) {
        current.paypalFee = (current.paypalFee ?? 0) + lineTotal
      }
      continue
    }

    const unit = unitCost !== undefined && !Number.isNaN(unitCost) ? unitCost : 0
    let qty = quantity !== undefined && !Number.isNaN(quantity) ? quantity : undefined
    const line =
      lineTotal !== undefined && !Number.isNaN(lineTotal)
        ? lineTotal
        : qty !== undefined
          ? qty * unit
          : 0
    if (qty === undefined) qty = unit > 0 && line > 0 ? Math.round((line / unit) * 100) / 100 : 1

    current.lines.push({
      rowNumber,
      product,
      dose: cell(cols, 'dose') || undefined,
      quantity: qty,
      unitCost: unit,
      lineTotal: line,
    })
  }

  // Flatten into line rows: order-level fields ride on the first line of each
  // order (groupDistributorOrders takes the first non-empty occurrence).
  const rows: DistributorLineRow[] = []
  for (const order of orders) {
    if (order.lines.length === 0) continue
    order.lines.forEach((l, i) => {
      rows.push({
        rowNumber: l.rowNumber,
        orderId: order.orderId,
        orderDate: i === 0 ? order.orderDate : undefined,
        shipping: i === 0 ? order.shipping : undefined,
        paypalFee: i === 0 ? order.paypalFee : undefined,
        total: i === 0 ? order.total : undefined,
        product: l.product,
        dose: l.dose,
        quantity: l.quantity,
        unitCost: l.unitCost,
        lineTotal: l.lineTotal,
      })
    })
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ rowNumber: headerRowIdx + 2, message: 'No order lines found in file' })
  }

  return { rows, errors }
}

/** Find a ledger-style header row within the first few rows of the sheet. */
function detectLedgerHeader(
  matrix: string[][]
): { rowIdx: number; col: Partial<Record<LedgerField, number>> } | null {
  const limit = Math.min(matrix.length, 10)
  for (let r = 0; r < limit; r++) {
    const col = mapLedgerHeader(matrix[r])
    if (col) return { rowIdx: r, col }
  }
  return null
}

export function parseDistributorOrderCsv(input: string): DistributorParseResult {
  const matrix = parseCsv(input)
  const errors: RowError[] = []
  const rows: DistributorLineRow[] = []

  if (matrix.length === 0) {
    return { rows, errors: [{ rowNumber: 1, message: 'File is empty' }] }
  }

  const header = matrix[0].map((h) => h.trim().toLowerCase())
  const colIndex: Partial<Record<Field, number>> = {}
  header.forEach((h, idx) => {
    const field = HEADER_ALIASES[h]
    if (field && colIndex[field] === undefined) colIndex[field] = idx
  })

  const missing = (['orderId', 'product'] as const).filter((f) => colIndex[f] === undefined)
  if (missing.length > 0) {
    // Not the flat format — check for the spreadsheet ledger layout before
    // giving up (date row starts each order, product lines follow).
    const ledger = detectLedgerHeader(matrix)
    if (ledger) return parseLedgerRows(matrix, ledger.rowIdx, ledger.col)

    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column(s): ${missing.join(', ')}. Expected headers like: ${DISTRIBUTOR_IMPORT_HEADERS.join(', ')} — or a ledger sheet with headers like: Date of Order, Total Order Amount, Products, Product dose, Amount, Cost per item, Totals`,
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

  for (let r = 1; r < matrix.length; r++) {
    const rowNumber = r + 1
    const cols = matrix[r]
    const rowErrors: string[] = []

    const orderId = cell(cols, 'orderId') || ''
    const product = cell(cols, 'product') || ''
    const quantity = toNumber(cell(cols, 'quantity'))
    const unitCost = toNumber(cell(cols, 'unitCost'))
    const lineTotal = toNumber(cell(cols, 'lineTotal'))
    const shipping = toNumber(cell(cols, 'shipping'))
    const paypalFee = toNumber(cell(cols, 'paypalFee'))
    const total = toNumber(cell(cols, 'total'))

    if (!orderId) rowErrors.push('orderId is required')
    if (!product) rowErrors.push('product is required')
    if (quantity === undefined) rowErrors.push('quantity is required')
    else if (Number.isNaN(quantity) || quantity < 0) rowErrors.push('quantity must be >= 0')
    for (const [label, val] of [
      ['unitCost', unitCost],
      ['lineTotal', lineTotal],
      ['shipping', shipping],
      ['paypalFee', paypalFee],
      ['total', total],
    ] as const) {
      if (val !== undefined && Number.isNaN(val)) rowErrors.push(`${label} must be a number`)
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join('; ') })
      continue
    }

    const qty = quantity as number
    const unit = unitCost !== undefined && !Number.isNaN(unitCost) ? unitCost : 0
    const line = lineTotal !== undefined && !Number.isNaN(lineTotal) ? lineTotal : qty * unit

    rows.push({
      rowNumber,
      orderId,
      orderDate: cell(cols, 'orderDate') || undefined,
      vendor: cell(cols, 'vendor') || undefined,
      status: cell(cols, 'status') || undefined,
      trackingNumber: cell(cols, 'trackingNumber') || undefined,
      shipping: shipping !== undefined && !Number.isNaN(shipping) ? shipping : undefined,
      paypalFee: paypalFee !== undefined && !Number.isNaN(paypalFee) ? paypalFee : undefined,
      total: total !== undefined && !Number.isNaN(total) ? total : undefined,
      product,
      dose: cell(cols, 'dose') || undefined,
      quantity: qty,
      unitCost: unit,
      lineTotal: line,
    })
  }

  return { rows, errors }
}

/** Group validated line rows into distributor orders by orderId. */
export function groupDistributorOrders(rows: DistributorLineRow[]): DistributorOrderImport[] {
  // Accumulator keeps order-level fields optional so we can distinguish
  // "never provided" from "provided on some row"; defaults apply at the end.
  interface OrderAcc {
    externalId: string
    orderDate?: string
    vendor?: string
    status?: string
    trackingNumber?: string
    shipping?: number
    paypalFee?: number
    total?: number
    lines: DistributorOrderImport['lines']
  }
  const byId = new Map<string, OrderAcc>()

  for (const row of rows) {
    let order = byId.get(row.orderId)
    if (!order) {
      order = { externalId: row.orderId, lines: [] }
      byId.set(row.orderId, order)
    }
    // Order-level fields: the first non-empty occurrence wins, so blank or
    // defaulted values on later line rows never clobber real values.
    if (order.orderDate === undefined && row.orderDate) order.orderDate = row.orderDate
    if (order.vendor === undefined && row.vendor) order.vendor = row.vendor
    if (order.status === undefined && row.status) order.status = row.status.toLowerCase()
    if (order.trackingNumber === undefined && row.trackingNumber)
      order.trackingNumber = row.trackingNumber
    if (order.shipping === undefined && row.shipping !== undefined) order.shipping = row.shipping
    if (order.paypalFee === undefined && row.paypalFee !== undefined)
      order.paypalFee = row.paypalFee
    if (order.total === undefined && row.total !== undefined) order.total = row.total

    order.lines.push({
      productName: row.product,
      dose: row.dose ?? '',
      quantity: row.quantity,
      unitCost: row.unitCost,
      lineTotal: row.lineTotal,
    })
  }

  // Finalize defaults + subtotal/total. An explicit per-order `total` wins.
  return Array.from(byId.values()).map((acc) => {
    const shipping = acc.shipping ?? 0
    const paypalFee = acc.paypalFee ?? 0
    const subtotal = acc.lines.reduce((sum, l) => sum + l.lineTotal, 0)
    return {
      externalId: acc.externalId,
      orderDate: acc.orderDate,
      vendor: acc.vendor || 'Distributor',
      status: acc.status || 'delivered',
      trackingNumber: acc.trackingNumber,
      shipping,
      paypalFee,
      subtotal,
      total: acc.total ?? subtotal + shipping + paypalFee,
      lines: acc.lines,
    }
  })
}

export function distributorOrderImportTemplate(): string {
  const header = DISTRIBUTOR_IMPORT_HEADERS.join(',')
  const example1 = [
    'DO-20260115-001',
    '2026-01-15',
    'Acme Peptides',
    'delivered',
    '1Z999',
    '25.00',
    '12.50',
    'Tirzepatide',
    '60mg',
    '10',
    '160.00',
    '1600.00',
  ].join(',')
  const example2 = [
    'DO-20260115-001',
    '',
    '',
    '',
    '',
    '',
    '',
    'Semaglutide',
    '10mg',
    '5',
    '90.00',
    '450.00',
  ].join(',')
  return `${header}\n${example1}\n${example2}\n`
}
