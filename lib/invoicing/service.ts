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
import { logger } from '../logger'
import { syncSalesRecordFromOrder } from '../sales'
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
      smsOptIn: true,
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
      // Already-collected orders must NOT be billable on AR terms — a card
      // payment at checkout (CAPTURED) or a refund means there's nothing to
      // invoice. Only orders still owed (PENDING/AUTHORIZED/FAILED) qualify.
      paymentStatus: { notIn: ['CAPTURED', 'REFUNDED'] },
      // Exclude orders already on a non-void invoice.
      invoiceLineItems: { none: { invoice: { status: { not: 'VOID' } } } },
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

/**
 * Create an invoice from selected orders and/or manual lines.
 *
 * The order-selection + line creation runs in a single transaction so two
 * concurrent invoice creations can't both attach the same order (double
 * billing). NOTE: the durable fix is a unique index on InvoiceLineItem.orderId
 * (partial, excluding VOID invoices) — until that exists, this transactional
 * re-check closes the window in practice.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceView> {
  const client = db()
  const created = await client.$transaction((tx) => createInvoiceTx(tx, input))
  // Recompute so a fully-zero or already-paid invoice lands in the right state.
  return recomputeStatus(created.id)
}

/**
 * Transactional core of {@link createInvoice} — callable inside a caller-owned
 * transaction (e.g. terms checkout, which must submit + invoice atomically).
 * Returns the raw created invoice; callers outside a transaction should use
 * `createInvoice`, which also recomputes status.
 */
export async function createInvoiceTx(
  tx: Prisma.TransactionClient,
  input: CreateInvoiceInput
): Promise<InvoiceWithRelations> {
  const issueDate = input.issueDate ?? new Date()
  const paymentTermsDays = input.paymentTermsDays ?? 30

  {
    // Guard against AR double-counting: `balanceForward` embeds prior unpaid
    // debt into this invoice's grossTotal. If the prior invoices carrying that
    // debt are still open, both would count toward the client's open balance.
    if ((input.balanceForward ?? 0) > 0) {
      const openPrior = await tx.invoice.count({
        where: { clientId: input.clientId, status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
      })
      if (openPrior > 0) {
        throw new Error(
          'Cannot carry a balance forward while the client has open invoices — void or settle them first (their balance would be double-counted)'
        )
      }
    }

    const lines: Prisma.InvoiceLineItemCreateWithoutInvoiceInput[] = []
    const orderIdsToLink: string[] = []

    if (input.orderIds && input.orderIds.length > 0) {
      const requestedIds = Array.from(new Set(input.orderIds))
      const orders = await tx.order.findMany({
        // Only this client's non-draft, still-owed orders are billable.
        where: {
          id: { in: requestedIds },
          clientId: input.clientId,
          status: { not: 'DRAFT' },
          paymentStatus: { notIn: ['CAPTURED', 'REFUNDED'] },
        },
        select: { id: true, orderNumber: true, total: true, createdAt: true },
      })

      // Fail loudly if any requested order was dropped (wrong client, draft,
      // already paid, or nonexistent) — don't silently bill a subset.
      if (orders.length !== requestedIds.length) {
        const found = new Set(orders.map((o) => o.id))
        const missing = requestedIds.filter((id) => !found.has(id))
        throw new Error(`Some orders are not billable or not found: ${missing.join(', ')}`)
      }

      // Reject orders already attached to a non-void invoice (dedupe / race).
      const alreadyLinked = await tx.invoiceLineItem.findMany({
        where: { orderId: { in: requestedIds }, invoice: { status: { not: 'VOID' } } },
        select: { orderId: true },
      })
      if (alreadyLinked.length > 0) {
        const dupes = Array.from(new Set(alreadyLinked.map((l) => l.orderId).filter(Boolean)))
        throw new Error(`Orders already invoiced: ${dupes.join(', ')}`)
      }

      for (const o of orders) {
        const total = num(o.total)
        orderIdsToLink.push(o.id)
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
      if (li.unitPrice < 0) {
        throw new Error('Line item unit price cannot be negative; use an adjustment for credits')
      }
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

    return tx.invoice.create({
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
  }
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

  // Preserve the original paid timestamp. Set it when the invoice first reaches
  // PAID; never wipe it if a later adjustment (e.g. a surcharge/late fee) pushes
  // the invoice back to PARTIAL/OVERDUE — the historical paid date is an audit
  // fact, not a live flag.
  const paidAt = nextStatus === 'PAID' ? (inv.paidAt ?? new Date()) : inv.paidAt
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

  const target = await client.invoice.findUnique({
    where: { id: invoiceId },
    include: INVOICE_INCLUDE,
  })
  if (!target) throw new Error('Invoice not found')
  if (target.status === 'VOID') throw new Error('Cannot record a payment on a void invoice')
  if (target.status === 'DRAFT') {
    throw new Error('Cannot record a payment on a draft invoice — issue it first')
  }

  if (input.stripePaymentIntentId) {
    const existing = await client.invoicePayment.findUnique({
      where: { stripePaymentIntentId: input.stripePaymentIntentId },
    })
    if (existing) {
      // This PI is already recorded. Only treat it as idempotent when it belongs
      // to THIS invoice — otherwise it's a mis-keyed call and must not silently
      // succeed against the wrong invoice.
      if (existing.invoiceId !== invoiceId) {
        throw new Error('This payment is already recorded on a different invoice')
      }
      return recomputeStatus(invoiceId)
    }
  }

  // Cap the recorded amount at the CURRENT amount due. A stale PaymentIntent
  // (created before a partial payment elsewhere) can capture more than the
  // live balance; recording the full stale amount would flip the invoice into
  // silent overpayment. The excess is logged + noted for a manual refund.
  const currentDue = decorateInvoice(target).totals.amountDue
  let recordedAmount = input.amount
  let overpayNote: string | null = null
  if (recordedAmount > currentDue + 0.005) {
    const excess = Math.round((recordedAmount - currentDue) * 100) / 100
    logger.warn('[INVOICING] payment exceeds amount due — capping recorded amount', {
      invoiceId,
      paymentAmount: input.amount,
      amountDue: currentDue,
      excess,
      stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    })
    if (currentDue <= 0) {
      // Nothing due — don't create a zero/negative payment row. Surface the
      // situation via the log above; the charge needs a manual refund.
      return recomputeStatus(invoiceId)
    }
    recordedAmount = currentDue
    overpayNote = `Overpayment: charged ${input.amount.toFixed(2)}, recorded ${recordedAmount.toFixed(2)} (excess ${excess.toFixed(2)} needs refund)`
  }

  await client.invoicePayment.create({
    data: {
      invoiceId,
      amount: new Prisma.Decimal(recordedAmount),
      method: input.method,
      reference: input.reference,
      stripePaymentIntentId: input.stripePaymentIntentId,
      notes: overpayNote ? [input.notes, overpayNote].filter(Boolean).join(' | ') : input.notes,
      paidAt: input.paidAt ?? new Date(),
    },
  })
  const view = await recomputeStatus(invoiceId)

  // When the invoice is now fully settled, mark its linked orders as collected
  // (CAPTURED) so fulfillment/analytics reflect the payment. Never blocks the
  // payment recording itself.
  if (view.invoice.status === 'PAID') {
    await settleOrdersForPaidInvoice(invoiceId).catch((e) =>
      logger.warn('[INVOICING] settleOrdersForPaidInvoice failed (non-blocking)', {
        invoiceId,
        error: e instanceof Error ? e.message : String(e),
      })
    )
  }
  return view
}

/**
 * Flip the still-owed orders linked to a PAID invoice to CAPTURED and re-sync
 * their SalesRecords. Idempotent — already-captured/refunded orders are left
 * untouched.
 */
async function settleOrdersForPaidInvoice(invoiceId: string): Promise<void> {
  const client = db()
  const lines = await client.invoiceLineItem.findMany({
    where: { invoiceId, orderId: { not: null } },
    select: { orderId: true },
  })
  const orderIds = Array.from(new Set(lines.map((l) => l.orderId).filter((id): id is string => !!id)))
  if (orderIds.length === 0) return

  const now = new Date()
  for (const orderId of orderIds) {
    const updated = await client.order.updateMany({
      where: { id: orderId, paymentStatus: { in: ['PENDING', 'AUTHORIZED', 'FAILED'] } },
      data: { paymentStatus: 'CAPTURED', paidAt: now },
    })
    if (updated.count > 0) {
      await syncSalesRecordFromOrder(orderId)
    }
  }
}

/**
 * A client's AR position: total due across open (OPEN/PARTIAL/OVERDUE)
 * invoices + whether anything is past due (credit hold). `hasOverdue` is
 * derived from live due dates, not just the persisted OVERDUE status, so a
 * checkout between overdue-cron runs is still held.
 */
export async function getClientBillingSnapshot(
  clientId: string,
  dbc?: Prisma.TransactionClient
): Promise<{ openBalance: number; hasOverdue: boolean }> {
  const client = dbc ?? db()
  const rows = await client.invoice.findMany({
    where: { clientId, status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } },
    include: INVOICE_INCLUDE,
  })
  const now = new Date()
  let openBalance = 0
  let hasOverdue = false
  for (const inv of rows) {
    const view = decorateInvoice(inv, now)
    openBalance += view.totals.amountDue
    if (view.totals.amountDue > 0 && (inv.status === 'OVERDUE' || view.daysPastDue > 0)) {
      hasOverdue = true
    }
  }
  return { openBalance: Math.round(openBalance * 100) / 100, hasOverdue }
}

/** Total amount due across a client's open invoices. */
export async function getClientOpenBalance(clientId: string): Promise<number> {
  return (await getClientBillingSnapshot(clientId)).openBalance
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
  const target = await client.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true },
  })
  if (!target) throw new Error('Invoice not found')
  if (target.status === 'VOID') throw new Error('Cannot adjust a void invoice')
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

/**
 * Void an invoice (terminal, reversible only by a new invoice).
 *
 * Refuses to void an invoice that already has payments recorded — voiding would
 * leave collected money attached to a "void" invoice. Such cases need a
 * credit/refund, not a void. On void, the linked orders are unlinked from their
 * line items so they become billable again (a mistaken void doesn't strand the
 * orders out of the unbilled list forever).
 */
export async function voidInvoice(invoiceId: string): Promise<InvoiceView> {
  const client = db()
  const inv = await client.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: { select: { id: true } } },
  })
  if (!inv) throw new Error('Invoice not found')
  if (inv.status === 'VOID') return decorateInvoice(await requireInvoice(invoiceId))
  if (inv.payments.length > 0) {
    throw new Error('Cannot void an invoice with recorded payments; issue a credit or refund instead')
  }

  const updated = await client.$transaction(async (tx) => {
    // Free the orders so they reappear as unbilled and can be re-invoiced.
    await tx.invoiceLineItem.updateMany({
      where: { invoiceId, orderId: { not: null } },
      data: { orderId: null },
    })
    return tx.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID', voidedAt: new Date() },
      include: INVOICE_INCLUDE,
    })
  })
  return decorateInvoice(updated)
}

async function requireInvoice(invoiceId: string): Promise<InvoiceWithRelations> {
  const inv = await db().invoice.findUnique({ where: { id: invoiceId }, include: INVOICE_INCLUDE })
  if (!inv) throw new Error('Invoice not found')
  return inv
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
 * All OVERDUE invoices that still carry a balance, decorated for notification.
 * Used by the overdue cron so reminders keep going out while debt is
 * outstanding (not only on the day the status first flips).
 */
export async function listOverdueInvoiceViews(now: Date = new Date()): Promise<InvoiceView[]> {
  const rows = await db().invoice.findMany({
    where: { status: 'OVERDUE' },
    include: INVOICE_INCLUDE,
  })
  return rows.map((r) => decorateInvoice(r, now)).filter((v) => v.totals.amountDue > 0)
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
