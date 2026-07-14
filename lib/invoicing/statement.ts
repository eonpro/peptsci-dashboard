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

const BUSINESS_TIME_ZONE = 'America/New_York'

const tzPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** UTC instant of local midnight (00:00) on Y-M-D in the business timezone. */
function businessMidnightUtc(year: number, month: number, day: number): Date {
  // Start from UTC midnight and correct by the timezone's rendering of that
  // instant; two iterations converge across DST boundaries.
  let guess = new Date(Date.UTC(year, month - 1, day))
  for (let i = 0; i < 2; i += 1) {
    const parts = Object.fromEntries(
      tzPartsFormatter.formatToParts(guess).map((p) => [p.type, p.value])
    ) as Record<string, string>
    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second)
    )
    const desired = Date.UTC(year, month - 1, day)
    guess = new Date(guess.getTime() + (desired - rendered))
  }
  return guess
}

/**
 * First/last instant of a YYYY-MM month in the business timezone
 * (America/New_York), so late-evening ET activity lands in the month the
 * client experienced it — matching the reports' NY-day bucketing.
 */
export function monthBounds(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const year = Number(m[1])
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) return null
  const start = businessMidnightUtc(year, mon, 1)
  const end = mon === 12 ? businessMidnightUtc(year + 1, 1, 1) : businessMidnightUtc(year, mon + 1, 1)
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

  // Aging + open invoices as of the STATEMENT PERIOD END (capped at now for
  // the current month) — a historical statement must show the aging picture
  // the client had at month end, not today's. Payments made after the period
  // are excluded from the snapshot for the same reason.
  const snapshotAt = new Date(Math.min(periodEnd.getTime() - 1, Date.now()))
  const aging = { current: 0, net30: 0, net60: 0, net90: 0, over90: 0 }
  const openInvoices: StatementData['openInvoices'] = []
  for (const inv of invoices) {
    // Only invoices issued by the snapshot instant existed on the statement.
    if (inv.issueDate.getTime() > snapshotAt.getTime()) continue
    const snapshotInv = {
      ...inv,
      payments: inv.payments.filter((p) => p.paidAt.getTime() <= snapshotAt.getTime()),
    }
    // decorateInvoice needs the full include shape; payments/adjustments/lineItems present.
    const view = decorateInvoice(snapshotInv as Parameters<typeof decorateInvoice>[0], snapshotAt)
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
