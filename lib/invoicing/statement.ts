/**
 * Monthly account statements: a per-client ledger of invoice/payment activity
 * for a period, with opening/closing balances and an AR aging summary.
 *
 * Balance model (matches getClientOpenBalance): balance = Σ issued invoice
 * grand totals − Σ payments, over non-VOID, non-DRAFT invoices. Adjustments
 * are folded into each invoice's grand total.
 */

import { prisma } from '../prisma'
import { computeInvoiceTotals, formatInvoiceNumber, type AdjustmentKind } from './core'
import { decorateInvoice } from './service'
import type { Prisma } from '@prisma/client'

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : d.toNumber()

export interface StatementLine {
  date: Date
  type: 'INVOICE' | 'PAYMENT'
  ref: string
  description: string
  /** Positive = charge, negative = credit/payment. */
  amount: number
  /** Running balance after this line. */
  balance: number
}

export interface StatementData {
  client: {
    id: string
    organizationName: string
    contactName: string | null
    contactEmail: string | null
    billingAddress: unknown
  }
  periodStart: Date
  periodEnd: Date
  openingBalance: number
  closingBalance: number
  lines: StatementLine[]
  openInvoices: Array<{
    number: string
    issueDate: Date
    dueDate: Date | null
    total: number
    amountDue: number
    status: string
    daysPastDue: number
  }>
  aging: { current: number; net30: number; net60: number; net90: number; over90: number }
}

/** First/last instant of a YYYY-MM month (UTC). */
export function monthBounds(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const year = Number(m[1])
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) return null
  const start = new Date(Date.UTC(year, mon - 1, 1))
  const end = new Date(Date.UTC(year, mon, 1))
  return { start, end }
}

export async function buildStatement(
  clientId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<StatementData | null> {
  if (!prisma) return null

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      organizationName: true,
      contactName: true,
      contactEmail: true,
      billingAddress: true,
    },
  })
  if (!client) return null

  const invoices = await prisma.invoice.findMany({
    where: { clientId, status: { notIn: ['VOID', 'DRAFT'] } },
    include: {
      lineItems: true,
      adjustments: true,
      payments: true,
    },
    orderBy: { issueDate: 'asc' },
  })

  type LedgerEvent = { date: Date; type: 'INVOICE' | 'PAYMENT'; ref: string; description: string; amount: number }
  const events: LedgerEvent[] = []

  for (const inv of invoices) {
    const totals = computeInvoiceTotals({
      lineItems: inv.lineItems.map((li) => ({
        quantity: li.quantity,
        unitPrice: num(li.unitPrice),
        amount: num(li.amount),
      })),
      adjustments: inv.adjustments.map((a) => ({
        kind: a.kind as AdjustmentKind,
        amount: a.amount == null ? null : num(a.amount),
        percent: a.percent == null ? null : num(a.percent),
      })),
      payments: [],
      balanceForward: num(inv.balanceForward),
    })
    const ref = formatInvoiceNumber(inv.invoiceNumber)
    events.push({
      date: inv.issueDate,
      type: 'INVOICE',
      ref,
      description: `Invoice ${ref}`,
      amount: totals.grossTotal,
    })
    for (const p of inv.payments) {
      events.push({
        date: p.paidAt,
        type: 'PAYMENT',
        ref,
        description: `Payment — ${p.method ?? 'received'} (${ref})`,
        amount: -num(p.amount),
      })
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime())

  let openingBalance = 0
  for (const ev of events) {
    if (ev.date < periodStart) openingBalance += ev.amount
  }
  openingBalance = Math.round(openingBalance * 100) / 100

  let running = openingBalance
  const lines: StatementLine[] = []
  for (const ev of events) {
    if (ev.date < periodStart || ev.date >= periodEnd) continue
    running = Math.round((running + ev.amount) * 100) / 100
    lines.push({ ...ev, balance: running })
  }
  const closingBalance = running

  // Aging + open invoices as of "now" (statement footer).
  const aging = { current: 0, net30: 0, net60: 0, net90: 0, over90: 0 }
  const openInvoices: StatementData['openInvoices'] = []
  for (const inv of invoices) {
    // decorateInvoice needs the full include shape; payments/adjustments/lineItems present.
    const view = decorateInvoice(inv as Parameters<typeof decorateInvoice>[0])
    if (view.totals.amountDue <= 0) continue
    aging[view.aging] += view.totals.amountDue
    openInvoices.push({
      number: formatInvoiceNumber(inv.invoiceNumber),
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: view.totals.grossTotal,
      amountDue: view.totals.amountDue,
      status: inv.status,
      daysPastDue: view.daysPastDue,
    })
  }
  for (const k of Object.keys(aging) as Array<keyof typeof aging>) {
    aging[k] = Math.round(aging[k] * 100) / 100
  }

  return {
    client,
    periodStart,
    periodEnd,
    openingBalance,
    closingBalance,
    lines,
    openInvoices,
    aging,
  }
}
