/**
 * Pure (DB-free) helpers for bulk sales CSV import. Mirrors lib/product-import.ts
 * conventions (RFC-4180 subset parser, header aliases, per-row validation,
 * downloadable template) so it can be unit-tested and shared between the API
 * route and scripts.
 *
 * Columns mirror the `Sale` shape. A row is meaningful when it has a paid
 * amount or identifies a customer/product; cost/COGS are optional (the API
 * estimates COGS from the catalog when omitted).
 */

import { parseCsv } from './product-import'

export interface SalesImportRow {
  /** 1-based row number in the source file (header = row 1). */
  rowNumber: number
  date?: string
  orderId?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  trackingNumber?: string
  invoicePaid?: boolean
  paidAmount: number
  vials: number
  amountPerVial: number
  product?: string
  notes?: string
  unitCost?: number
  cogs?: number
}

export interface RowError {
  rowNumber: number
  message: string
}

export interface SalesParseResult {
  rows: SalesImportRow[]
  errors: RowError[]
}

type SalesField = keyof Omit<SalesImportRow, 'rowNumber'>

/** Canonical CSV header order for the downloadable template. */
export const SALES_IMPORT_HEADERS = [
  'date',
  'orderId',
  'customerName',
  'customerEmail',
  'customerPhone',
  'address',
  'city',
  'state',
  'zip',
  'trackingNumber',
  'invoicePaid',
  'paidAmount',
  'vials',
  'amountPerVial',
  'product',
  'notes',
  'unitCost',
  'cogs',
] as const

const HEADER_ALIASES: Record<string, SalesField> = {
  date: 'date',
  'order date': 'date',
  orderid: 'orderId',
  'order id': 'orderId',
  order: 'orderId',
  'invoice #': 'orderId',
  customername: 'customerName',
  'customer name': 'customerName',
  'provider name': 'customerName',
  customer: 'customerName',
  customeremail: 'customerEmail',
  'customer email': 'customerEmail',
  email: 'customerEmail',
  customerphone: 'customerPhone',
  'customer phone': 'customerPhone',
  phone: 'customerPhone',
  address: 'address',
  'practice address': 'address',
  city: 'city',
  state: 'state',
  zip: 'zip',
  'zip code': 'zip',
  trackingnumber: 'trackingNumber',
  'tracking number': 'trackingNumber',
  'tracking #': 'trackingNumber',
  invoicepaid: 'invoicePaid',
  'invoice paid': 'invoicePaid',
  paid: 'invoicePaid',
  paidamount: 'paidAmount',
  'paid amount': 'paidAmount',
  'invoice total': 'paidAmount',
  total: 'paidAmount',
  amount: 'paidAmount',
  vials: 'vials',
  'units #': 'vials',
  units: 'vials',
  quantity: 'vials',
  qty: 'vials',
  amountpervial: 'amountPerVial',
  'amount per vial': 'amountPerVial',
  'price/unit': 'amountPerVial',
  'price per unit': 'amountPerVial',
  product: 'product',
  treatment: 'product',
  notes: 'notes',
  status: 'notes',
  unitcost: 'unitCost',
  'unit cost': 'unitCost',
  cost: 'unitCost',
  cogs: 'cogs',
}

function toNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined
  const cleaned = raw.replace(/[$,\s]/g, '').trim()
  if (cleaned === '') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

function toBool(raw: string | undefined): boolean {
  if (!raw) return false
  const v = raw.trim().toLowerCase()
  return v === 'yes' || v === 'paid' || v === 'true' || v === '1' || v === 'y'
}

/**
 * Map raw CSV text into validated SalesImportRow[] plus per-row errors.
 * A row must carry a paid amount, customer, or product to be meaningful.
 */
export function parseSalesCsv(input: string): SalesParseResult {
  const matrix = parseCsv(input)
  const errors: RowError[] = []
  const rows: SalesImportRow[] = []

  if (matrix.length === 0) {
    return { rows, errors: [{ rowNumber: 1, message: 'File is empty' }] }
  }

  const header = matrix[0].map((h) => h.trim().toLowerCase())
  const colIndex: Partial<Record<SalesField, number>> = {}
  header.forEach((h, idx) => {
    const field = HEADER_ALIASES[h]
    if (field && colIndex[field] === undefined) colIndex[field] = idx
  })

  const recognized = Object.keys(colIndex).length
  if (recognized === 0) {
    return {
      rows,
      errors: [
        {
          rowNumber: 1,
          message: `No recognized columns. Expected headers like: ${SALES_IMPORT_HEADERS.join(', ')}`,
        },
      ],
    }
  }

  const cell = (cols: string[], field: SalesField): string | undefined => {
    const idx = colIndex[field]
    if (idx === undefined) return undefined
    const v = cols[idx]
    return v === undefined ? undefined : v.trim()
  }

  for (let r = 1; r < matrix.length; r++) {
    const rowNumber = r + 1
    const cols = matrix[r]
    const rowErrors: string[] = []

    const paidAmount = toNumber(cell(cols, 'paidAmount'))
    const vials = toNumber(cell(cols, 'vials'))
    const amountPerVial = toNumber(cell(cols, 'amountPerVial'))
    const unitCost = toNumber(cell(cols, 'unitCost'))
    const cogs = toNumber(cell(cols, 'cogs'))
    const customerName = cell(cols, 'customerName')
    const product = cell(cols, 'product')

    for (const [label, val] of [
      ['paidAmount', paidAmount],
      ['vials', vials],
      ['amountPerVial', amountPerVial],
      ['unitCost', unitCost],
      ['cogs', cogs],
    ] as const) {
      if (val !== undefined && Number.isNaN(val)) rowErrors.push(`${label} must be a number`)
    }

    const paidAmountVal = paidAmount && !Number.isNaN(paidAmount) ? paidAmount : 0
    if (!customerName && !product && paidAmountVal <= 0) {
      // Nothing identifies this row — skip silently rather than erroring so
      // trailing/blank rows don't fail the whole import.
      continue
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join('; ') })
      continue
    }

    rows.push({
      rowNumber,
      date: cell(cols, 'date') || undefined,
      orderId: cell(cols, 'orderId') || undefined,
      customerName: customerName || undefined,
      customerEmail: cell(cols, 'customerEmail') || undefined,
      customerPhone: cell(cols, 'customerPhone') || undefined,
      address: cell(cols, 'address') || undefined,
      city: cell(cols, 'city') || undefined,
      state: cell(cols, 'state') || undefined,
      zip: cell(cols, 'zip') || undefined,
      trackingNumber: cell(cols, 'trackingNumber') || undefined,
      invoicePaid: colIndex.invoicePaid !== undefined ? toBool(cell(cols, 'invoicePaid')) : undefined,
      paidAmount: paidAmountVal,
      vials: vials && !Number.isNaN(vials) ? vials : 0,
      amountPerVial: amountPerVial && !Number.isNaN(amountPerVial) ? amountPerVial : 0,
      product: product || undefined,
      notes: cell(cols, 'notes') || undefined,
      unitCost: unitCost !== undefined && !Number.isNaN(unitCost) ? unitCost : undefined,
      cogs: cogs !== undefined && !Number.isNaN(cogs) ? cogs : undefined,
    })
  }

  return { rows, errors }
}

/** CSV template text (header + one example row) for the download button. */
export function salesImportTemplate(): string {
  const header = SALES_IMPORT_HEADERS.join(',')
  const example = [
    '2026-01-15',
    'P-0115-001',
    'Dr. Jane Smith',
    'jane@clinic.com',
    '555-123-4567',
    '123 Main St',
    'Austin',
    'TX',
    '78701',
    '1Z999',
    'yes',
    '899.00',
    '2',
    '449.50',
    'Tirzepatide 60mg',
    'Completed',
    '160.00',
    '320.00',
  ].join(',')
  return `${header}\n${example}\n`
}
