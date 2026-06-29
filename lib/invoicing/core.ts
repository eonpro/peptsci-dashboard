/**
 * Pure, dependency-free invoicing math: totals, aging, status, and due-date
 * derivation. Adapted from eonpro/logos-rx-invoicing `src/types/billing.ts`,
 * trimmed to PeptSci's B2B AR needs (no double-entry GL / fiscal periods).
 *
 * All money is plain `number` dollars at this boundary; the service converts
 * Prisma `Decimal` ↔ number. Holds NO Prisma/Clerk imports so it is unit-tested
 * in isolation (mirrors lib/returns/core.ts, lib/inventory/reservations-core.ts).
 *
 * @module lib/invoicing/core
 */

export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID'
export type AdjustmentKind = 'FIXED' | 'PERCENT'
export type AgingBucket = 'current' | 'net30' | 'net60' | 'net90' | 'over90'

export interface LineItemInput {
  quantity: number
  unitPrice: number
  /** Optional precomputed amount; defaults to quantity × unitPrice. */
  amount?: number
}

export interface AdjustmentInput {
  kind: AdjustmentKind
  /** FIXED dollars (negative = discount, positive = surcharge). */
  amount?: number | null
  /** PERCENT of subtotal (negative = discount, positive = surcharge). */
  percent?: number | null
}

export interface PaymentInput {
  amount: number
}

export interface InvoiceTotalsInput {
  lineItems: LineItemInput[]
  adjustments?: AdjustmentInput[]
  payments?: PaymentInput[]
  balanceForward?: number
}

export interface InvoiceTotals {
  subtotal: number
  balanceForward: number
  totalAdjustments: number
  totalDiscounts: number
  totalSurcharges: number
  grossTotal: number
  totalPayments: number
  amountDue: number
  creditBalance: number
}

/** Round to cents (avoids FP drift like 0.1 + 0.2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function lineAmount(li: LineItemInput): number {
  if (typeof li.amount === 'number') return li.amount
  return round2((li.quantity ?? 0) * (li.unitPrice ?? 0))
}

/** Resolve a single adjustment to signed dollars against a subtotal. */
export function resolveAdjustmentAmount(adj: AdjustmentInput, subtotal: number): number {
  if (adj.kind === 'PERCENT' || typeof adj.percent === 'number') {
    return round2((subtotal * (adj.percent ?? 0)) / 100)
  }
  return round2(adj.amount ?? 0)
}

export function computeInvoiceTotals(inv: InvoiceTotalsInput): InvoiceTotals {
  const subtotal = round2((inv.lineItems ?? []).reduce((s, li) => s + lineAmount(li), 0))
  const balanceForward = round2(inv.balanceForward ?? 0)

  const adjAmounts = (inv.adjustments ?? []).map((a) => resolveAdjustmentAmount(a, subtotal))
  const totalAdjustments = round2(adjAmounts.reduce((s, a) => s + a, 0))
  const totalDiscounts = round2(
    adjAmounts.reduce((s, a) => (a < 0 ? s + Math.abs(a) : s), 0)
  )
  const totalSurcharges = round2(adjAmounts.reduce((s, a) => (a > 0 ? s + a : s), 0))

  const grossTotal = round2(subtotal + totalAdjustments + balanceForward)
  const totalPayments = round2((inv.payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0))
  const rawBalance = round2(grossTotal - totalPayments)
  const amountDue = Math.max(rawBalance, 0)
  const creditBalance = Math.max(-rawBalance, 0)

  return {
    subtotal,
    balanceForward,
    totalAdjustments,
    totalDiscounts,
    totalSurcharges,
    grossTotal,
    totalPayments,
    amountDue,
    creditBalance,
  }
}

const DAY_MS = 1000 * 60 * 60 * 24

/** Due date = issue date + terms (days). */
export function deriveDueDate(issueDate: Date, paymentTermsDays: number): Date {
  const due = new Date(issueDate.getTime())
  due.setDate(due.getDate() + Math.max(0, Math.trunc(paymentTermsDays)))
  return due
}

/** Days an invoice is past due (negative = not yet due). */
export function daysPastDue(dueDate: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / DAY_MS)
}

export function agingBucket(amountDue: number, dueDate: Date, now: Date = new Date()): AgingBucket {
  if (amountDue <= 0) return 'current'
  const diff = daysPastDue(dueDate, now)
  if (diff <= 0) return 'current'
  if (diff <= 30) return 'net30'
  if (diff <= 60) return 'net60'
  if (diff <= 90) return 'net90'
  return 'over90'
}

/**
 * Derive the persisted status from totals + due date. DRAFT and VOID are
 * sticky (caller-controlled) and never auto-derived here.
 */
export function deriveInvoiceStatus(params: {
  totals: Pick<InvoiceTotals, 'amountDue' | 'totalPayments' | 'grossTotal'>
  dueDate: Date
  now?: Date
}): Exclude<InvoiceStatus, 'DRAFT' | 'VOID'> {
  const { totals, dueDate } = params
  const now = params.now ?? new Date()
  if (totals.grossTotal > 0 && totals.amountDue <= 0) return 'PAID'
  if (daysPastDue(dueDate, now) > 0) return 'OVERDUE'
  if (totals.totalPayments > 0) return 'PARTIAL'
  return 'OPEN'
}

/** Display invoice number, e.g. 42 → "INV-00042". */
export function formatInvoiceNumber(n: number): string {
  return `INV-${String(Math.max(0, Math.trunc(n))).padStart(5, '0')}`
}

export function isTerminalInvoiceStatus(status: InvoiceStatus): boolean {
  return status === 'PAID' || status === 'VOID'
}
