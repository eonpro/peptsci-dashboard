/**
 * Prisma-backed invoicing service for B2B accounts receivable.
 *
 * Composes the pure invoicing math (lib/invoicing/core.ts) with persistence:
 * create invoices (from a client's unbilled orders or manual lines), record
 * payments + adjustments, recompute status/due-date, list with aging, and void.
 *
 * Money crosses the Prisma boundary as Decimal; we narrow to `number` for the
 * pure core and write back with `new Prisma.Decimal(...)`.
 *
 * @module lib/invoicing/service
 */

import { Prisma, type InvoiceStatus as PrismaInvoiceStatus } from '@prisma/client'
import { prisma } from '../prisma'
import {
  computeInvoiceTotals,
  deriveDueDate,
  deriveInvoiceStatus,
  agingBucket,
  daysPastDue,
  type InvoiceTotals,
  type AgingBucket,
  type AdjustmentKind,
} from './core'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === 'number' ? d : d.toNumber()

const INVOICE_INCLUDE = {
  client: {
    select: {
      id: true,
      organizationName: true,
      contactEmail: true,
      contactPhone: true,
      billingAddress: true,
    },
  },
  lineItems: { orderBy: { createdAt: 'asc' } },
  adjustments: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { paidAt: 'asc' } },
} satisfies Prisma.InvoiceInclude

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>

export interface InvoiceView {
  invoice: InvoiceWithRelations
  totals: InvoiceTotals
  aging: AgingBucket
  daysPastDue: number
}

/** Map a persisted invoice + relations to totals/aging using the pure core. */
export function decorateInvoice(inv: InvoiceWithRelations, now: Date = new Date()): InvoiceView {
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
    payments: inv.payments.map((p) => ({ amount: num(p.amount) })),
    balanceForward: num(inv.balanceForward),
  })
  const due = inv.dueDate ?? deriveDueDate(inv.issueDate, inv.paymentTermsDays)
  return {
    invoice: inv,
    totals,
    aging: agingBucket(totals.amountDue, due, now),
    daysPastDue: daysPastDue(due, now),
  }
}

export interface CreateInvoiceInput {
  clientId: string
  orderIds?: string[]
  /** Manual lines (used when not deriving from orders). */
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number; orderId?: string }>
  paymentTermsDays?: number
  issueDate?: Date
  periodStart?: Date | null
  periodEnd?: Date | null
  balanceForward?: number
  notes?: string
  createdById?: string
  /** When true the invoice opens immediately; otherwise it stays DRAFT. */
  issue?: boolean
}

/** Orders for a client that aren't on any invoice yet (candidate lines). */
export async function getUnbilledOrders(clientId: string) {
  const orders = await db().order.findMany({
    where: {
      clientId,
      status: { not: 'DRAFT' },
      invoiceLineItems: { none: {} },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, orderNumber: true, total: true, createdAt: true, status: true, paymentStatus: true },
  })
  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    total: num(o.total),
    createdAt: o.createdAt.toISOString(),
    status: o.status,
    paymentStatus: o.paymentStatus,
  }))
}

/** Create an invoice from selected orders and/or manual lines. */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceView> {
  const client = db()
  const issueDate = input.issueDate ?? new Date()
  const paymentTermsDays = input.paymentTermsDays ?? 30

  const lines: Prisma.InvoiceLineItemCreateWithoutInvoiceInput[] = []

  if (input.orderIds && input.orderIds.length > 0) {
    const orders = await client.order.findMany({
      where: { id: { in: input.orderIds }, clientId: input.clientId },
      select: { id: true, orderNumber: true, total: true, createdAt: true },
    })
    for (const o of orders) {
      const total = num(o.total)
      lines.push({
        order: { connect: { id: o.id } },
        description: `Order #${o.orderNumber} — ${o.createdAt.toISOString().slice(0, 10)}`,
        quantity: 1,
        unitPrice: new Prisma.Decimal(total),
        amount: new Prisma.Decimal(total),
      })
    }
  }

  for (const li of input.lineItems ?? []) {
    const amount = Math.round((li.quantity * li.unitPrice + Number.EPSILON) * 100) / 100
    lines.push({
      ...(li.orderId ? { order: { connect: { id: li.orderId } } } : {}),
      description: li.description,
      quantity: li.quantity,
      unitPrice: new Prisma.Decimal(li.unitPrice),
      amount: new Prisma.Decimal(amount),
    })
  }

  if (lines.length === 0) throw new Error('An invoice needs at least one line item')

  const created = await client.invoice.create({
    data: {
      clientId: input.clientId,
      status: input.issue ? 'OPEN' : 'DRAFT',
      issueDate,
      paymentTermsDays,
      dueDate: deriveDueDate(issueDate, paymentTermsDays),
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      balanceForward: new Prisma.Decimal(input.balanceForward ?? 0),
      notes: input.notes,
      createdById: input.createdById,
      lineItems: { create: lines },
    },
    include: INVOICE_INCLUDE,
  })

  // Recompute so a fully-zero or already-paid invoice lands in the right state.
  return recomputeStatus(created.id)
}

/** Recompute persisted status/dueDate/paidAt from current lines+payments. */
export async function recomputeStatus(invoiceId: string): Promise<InvoiceView> {
  const client = db()
  const inv = await client.invoice.findUnique({ where: { id: invoiceId }, include: INVOICE_INCLUDE })
  if (!inv) throw new Error('Invoice not found')

  // DRAFT and VOID are sticky — never auto-transitioned.
  if (inv.status === 'DRAFT' || inv.status === 'VOID') return decorateInvoice(inv)

  const view = decorateInvoice(inv)
  const nextStatus = deriveInvoiceStatus({
    totals: view.totals,
    dueDate: inv.dueDate ?? deriveDueDate(inv.issueDate, inv.paymentTermsDays),
  }) as PrismaInvoiceStatus

  const paidAt = nextStatus === 'PAID' ? (inv.paidAt ?? new Date()) : null
  if (nextStatus !== inv.status || (paidAt?.getTime() ?? null) !== (inv.paidAt?.getTime() ?? null)) {
    const updated = await client.invoice.update({
      where: { id: invoiceId },
      data: { status: nextStatus, paidAt },
      include: INVOICE_INCLUDE,
    })
    return decorateInvoice(updated)
  }
  return view
}

/** Transition a DRAFT invoice to OPEN (issue it). */
export async function issueInvoice(invoiceId: string): Promise<InvoiceView> {
  const client = db()
  const inv = await client.invoice.findUnique({ where: { id: invoiceId } })
  if (!inv) throw new Error('Invoice not found')
  if (inv.status === 'DRAFT') {
    await client.invoice.update({ where: { id: invoiceId }, data: { status: 'OPEN' } })
  }
  return recomputeStatus(invoiceId)
}

export interface RecordPaymentInput {
  amount: number
  method?: string
  reference?: string
  stripePaymentIntentId?: string
  notes?: string
  paidAt?: Date
}

/** Record a payment against an invoice and recompute status. Idempotent on PI. */
export async function recordPayment(
  invoiceId: string,
  input: RecordPaymentInput
): Promise<InvoiceView> {
  const client = db()
  if (!(input.amount > 0)) throw new Error('Payment amount must be positive')

  if (input.stripePaymentIntentId) {
    const existing = await client.invoicePayment.findUnique({
      where: { stripePaymentIntentId: input.stripePaymentIntentId },
    })
    if (existing) return recomputeStatus(invoiceId)
  }

  await client.invoicePayment.create({
    data: {
      invoiceId,
      amount: new Prisma.Decimal(input.amount),
      method: input.method,
      reference: input.reference,
      stripePaymentIntentId: input.stripePaymentIntentId,
      notes: input.notes,
      paidAt: input.paidAt ?? new Date(),
    },
  })
  return recomputeStatus(invoiceId)
}

export interface AddAdjustmentInput {
  kind: AdjustmentKind
  amount?: number | null
  percent?: number | null
  reason?: string
  createdBy?: string
}

export async function addAdjustment(
  invoiceId: string,
  input: AddAdjustmentInput
): Promise<InvoiceView> {
  const client = db()
  if (input.kind === 'FIXED' && typeof input.amount !== 'number') {
    throw new Error('Fixed adjustment requires an amount')
  }
  if (input.kind === 'PERCENT' && typeof input.percent !== 'number') {
    throw new Error('Percent adjustment requires a percent')
  }
  await client.invoiceAdjustment.create({
    data: {
      invoiceId,
      kind: input.kind,
      amount: input.kind === 'FIXED' ? new Prisma.Decimal(input.amount as number) : null,
      percent: input.kind === 'PERCENT' ? new Prisma.Decimal(input.percent as number) : null,
      reason: input.reason ?? '',
      createdBy: input.createdBy,
    },
  })
  return recomputeStatus(invoiceId)
}

/** Void an invoice (terminal, reversible only by a new invoice). */
export async function voidInvoice(invoiceId: string): Promise<InvoiceView> {
  const client = db()
  const updated = await client.invoice.update({
    where: { id: invoiceId },
    data: { status: 'VOID', voidedAt: new Date() },
    include: INVOICE_INCLUDE,
  })
  return decorateInvoice(updated)
}

export interface ListInvoicesParams {
  clientId?: string
  status?: PrismaInvoiceStatus
  page?: number
  limit?: number
}

export async function listInvoices(params: ListInvoicesParams = {}) {
  const client = db()
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 25))
  const where: Prisma.InvoiceWhereInput = {
    ...(params.clientId ? { clientId: params.clientId } : {}),
    ...(params.status ? { status: params.status } : {}),
  }
  const [rows, total] = await Promise.all([
    client.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: INVOICE_INCLUDE,
    }),
    client.invoice.count({ where }),
  ])
  const now = new Date()
  return {
    invoices: rows.map((r) => decorateInvoice(r, now)),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  }
}

export async function getInvoice(invoiceId: string): Promise<InvoiceView | null> {
  const inv = await db().invoice.findUnique({ where: { id: invoiceId }, include: INVOICE_INCLUDE })
  return inv ? decorateInvoice(inv) : null
}

/**
 * Find OPEN/PARTIAL invoices that are now past due and flip them to OVERDUE.
 * Returns the affected invoice views (for notification/email by the caller).
 */
export async function markOverdueInvoices(now: Date = new Date()): Promise<InvoiceView[]> {
  const client = db()
  const candidates = await client.invoice.findMany({
    where: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: now } },
    include: INVOICE_INCLUDE,
  })
  const flipped: InvoiceView[] = []
  for (const inv of candidates) {
    const view = decorateInvoice(inv, now)
    if (view.totals.amountDue > 0 && view.daysPastDue > 0) {
      const updated = await client.invoice.update({
        where: { id: inv.id },
        data: { status: 'OVERDUE' },
        include: INVOICE_INCLUDE,
      })
      flipped.push(decorateInvoice(updated, now))
    }
  }
  return flipped
}
