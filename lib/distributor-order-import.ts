/**
 * Pure (DB-free) helpers for distributor purchase-order CSV import. Mirrors
 * lib/product-import.ts conventions. The CSV is flat: one row per line item,
 * grouped into orders by `orderId`. Order-level fields (date, vendor, status,
 * shipping, paypalFee, tracking) are read from the first row of each group.
 *
 * Required per row: orderId, product, quantity.
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
    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column(s): ${missing.join(', ')}. Expected headers like: ${DISTRIBUTOR_IMPORT_HEADERS.join(', ')}`,
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
