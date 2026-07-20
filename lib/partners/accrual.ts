/**
 * Commission accrual: turns captured platform Orders from partner-attributed
 * clinics into PartnerTransaction + CommissionEntry ledger rows, and claws
 * commissions back proportionally when orders are refunded.
 *
 * Called from the payment-capture path (lib/stripe/payments.ts), the invoice
 * payment path (lib/invoicing/service.ts), and the refund path
 * (lib/orders/refund.ts). ALWAYS best-effort from the caller's perspective:
 * accrual failures are logged, never thrown into the payment flow.
 *
 * Idempotency: one PartnerTransaction per order via the unique
 * `reference = "order:<orderId>"`; a concurrent double-accrual loses the
 * unique-constraint race and becomes a no-op.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  computeCommissionSplit,
  computeMarginSplit,
  dollarsToCents,
  reversalDelta,
  validateOrgRateBps,
  type CommissionSplitEntry,
} from './commission'
import { dispatchPartnerEvent } from './webhooks'

export function orderReference(orderId: string): string {
  return `order:${orderId}`
}

/** Start of the current calendar quarter (UTC). */
export function quarterStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1))
}

/**
 * The org's effective commission rate right now: base rate plus the highest
 * volume-tier bonus whose quarter-to-date revenue threshold has been reached.
 * Capped at 100%. Tiers only apply to COMMISSION-model orgs.
 */
export async function effectiveOrgRateBps(orgId: string, baseRateBps: number): Promise<number> {
  if (!prisma) return baseRateBps
  try {
    const tiers = await prisma.partnerRateTier.findMany({
      where: { orgId },
      orderBy: { thresholdCents: 'asc' },
      select: { thresholdCents: true, bonusBps: true },
    })
    if (tiers.length === 0) return baseRateBps

    const qtd = await prisma.partnerTransaction.aggregate({
      where: { orgId, transactionDate: { gte: quarterStart() } },
      _sum: { revenueCents: true },
    })
    const revenue = qtd._sum.revenueCents ?? 0
    let bonus = 0
    for (const tier of tiers) {
      if (revenue >= tier.thresholdCents) bonus = tier.bonusBps
    }
    return Math.min(10_000, baseRateBps + bonus)
  } catch {
    return baseRateBps
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

/**
 * Accrue commission for a captured order, if its clinic is attributed to an
 * ACTIVE partner org. Safe to call repeatedly (webhook + confirm endpoint).
 */
export async function accrueCommissionForOrder(orderId: string): Promise<void> {
  if (!prisma) return
  try {
    const existing = await prisma.partnerTransaction.findUnique({
      where: { reference: orderReference(orderId) },
      select: { id: true },
    })
    if (existing) return

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          select: {
            id: true,
            partnerOrgId: true,
            partnerRepId: true,
            organizationName: true,
          },
        },
        items: { select: { variantId: true, quantity: true, totalPrice: true } },
      },
    })
    if (!order || !order.client.partnerOrgId) return

    const org = await prisma.partnerOrg.findUnique({
      where: { id: order.client.partnerOrgId },
      select: { id: true, status: true, compensationModel: true, commissionRateBps: true },
    })
    if (!org || org.status !== 'ACTIVE') return

    // Rep carve-out only applies while the rep is active; a suspended rep's
    // share reverts to the org.
    let repId: string | null = null
    let repRateBps = 0
    if (order.client.partnerRepId) {
      const rep = await prisma.partnerRep.findUnique({
        where: { id: order.client.partnerRepId },
        select: { id: true, status: true, commissionRateBps: true },
      })
      if (rep && rep.status === 'ACTIVE' && rep.commissionRateBps > 0) {
        repId = rep.id
        repRateBps = rep.commissionRateBps
      }
    }

    const revenueCents = dollarsToCents(Number(order.total))
    if (revenueCents <= 0) return

    let entries: CommissionSplitEntry[]
    let costCents: number | null = null

    if (org.compensationModel === 'MARGIN') {
      // Margin = Σ per line max(0, lineTotal − floor × qty). Lines without a
      // configured floor contribute zero margin (cost = the full line total),
      // so unpriced SKUs never leak commission.
      const floors = await prisma.partnerOrgPricing.findMany({
        where: { orgId: org.id, variantId: { in: order.items.map((i) => i.variantId) } },
        select: { variantId: true, floorCents: true },
      })
      const floorByVariant = new Map(floors.map((f) => [f.variantId, f.floorCents]))
      let marginCents = 0
      for (const item of order.items) {
        const lineCents = dollarsToCents(Number(item.totalPrice))
        const floor = floorByVariant.get(item.variantId)
        if (floor == null) continue
        marginCents += Math.max(0, lineCents - floor * item.quantity)
      }
      costCents = revenueCents - marginCents
      entries = computeMarginSplit({ marginCents, repRateBps })
    } else {
      if (validateOrgRateBps(org.commissionRateBps) || org.commissionRateBps <= 0) return
      // Volume tiers: quarter-to-date revenue can bump the org rate.
      const orgRateBps = await effectiveOrgRateBps(org.id, org.commissionRateBps)
      const effectiveRepRate = Math.min(repRateBps, orgRateBps)
      entries = computeCommissionSplit({
        revenueCents,
        orgRateBps,
        repRateBps: effectiveRepRate,
      })
    }

    const payable = entries.filter((e) => e.amountCents > 0)
    if (payable.length === 0) return

    await prisma.partnerTransaction.create({
      data: {
        clientId: order.client.id,
        orgId: org.id,
        repId,
        transactionDate: order.paidAt ?? new Date(),
        description: `Order #${order.orderNumber} — ${order.client.organizationName}`,
        reference: orderReference(orderId),
        revenueCents,
        costCents,
        source: 'ORDER',
        entries: {
          create: payable.map((e) => ({
            orgId: org.id,
            repId: e.payee === 'REP' ? repId : null,
            payee: e.payee,
            kind: 'EARNING',
            rateBps: e.rateBps,
            amountCents: e.amountCents,
            status: 'PENDING',
          })),
        },
      },
    })

    logger.info('[PARTNER ACCRUAL] Commission accrued', {
      orderId,
      orgId: org.id,
      repId,
      revenueCents,
      model: org.compensationModel,
    })
    void dispatchPartnerEvent(org.id, 'commission.accrued', {
      reference: orderReference(orderId),
      clientId: order.client.id,
      revenueCents,
      entries: payable,
    })
  } catch (err) {
    if (isUniqueViolation(err)) return // concurrent accrual already won
    logger.warn('[PARTNER ACCRUAL] accrual failed (non-blocking)', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export interface ManualTransactionInput {
  orgId: string
  clientId: string
  transactionDate: Date
  description?: string | null
  /** Stable dedup key (CSV imports); duplicates are skipped. */
  reference?: string | null
  revenueCents: number
  /** Wholesale cost override for MARGIN orgs; defaults to full revenue (zero margin). */
  costCents?: number | null
  source: 'MANUAL' | 'CSV'
  createdBy: string
}

export class ManualAccrualError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ManualAccrualError'
  }
}

/**
 * Record an off-platform revenue event for an attributed clinic and write its
 * commission split. Used by the admin manual-entry form and CSV import.
 * Returns null when a non-null reference already exists (idempotent import).
 */
export async function accrueManualTransaction(
  input: ManualTransactionInput
): Promise<{ transactionId: string } | null> {
  if (!prisma) throw new ManualAccrualError('Database not connected', 'DB_UNAVAILABLE', 503)
  if (!Number.isInteger(input.revenueCents) || input.revenueCents <= 0) {
    throw new ManualAccrualError('Revenue must be a positive amount.', 'AMOUNT_INVALID', 400)
  }

  if (input.reference) {
    const existing = await prisma.partnerTransaction.findUnique({
      where: { reference: input.reference },
      select: { id: true },
    })
    if (existing) return null
  }

  const org = await prisma.partnerOrg.findUnique({
    where: { id: input.orgId },
    select: { id: true, status: true, compensationModel: true, commissionRateBps: true },
  })
  if (!org) throw new ManualAccrualError('Partner org not found', 'NOT_FOUND', 404)

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, partnerOrgId: true, partnerRepId: true },
  })
  if (!client || client.partnerOrgId !== org.id) {
    throw new ManualAccrualError(
      'That clinic is not attributed to this partner org.',
      'NOT_ATTRIBUTED',
      400
    )
  }

  let repId: string | null = null
  let repRateBps = 0
  if (client.partnerRepId) {
    const rep = await prisma.partnerRep.findUnique({
      where: { id: client.partnerRepId },
      select: { id: true, status: true, commissionRateBps: true },
    })
    if (rep && rep.status === 'ACTIVE' && rep.commissionRateBps > 0) {
      repId = rep.id
      repRateBps = rep.commissionRateBps
    }
  }

  let entries: CommissionSplitEntry[]
  let costCents: number | null = null
  if (org.compensationModel === 'MARGIN') {
    costCents = Math.min(input.costCents ?? input.revenueCents, input.revenueCents)
    const marginCents = Math.max(0, input.revenueCents - costCents)
    entries = computeMarginSplit({ marginCents, repRateBps })
  } else {
    if (org.commissionRateBps <= 0) {
      throw new ManualAccrualError(
        'Set the org commission rate before recording transactions.',
        'RATE_UNSET',
        400
      )
    }
    const orgRateBps = await effectiveOrgRateBps(org.id, org.commissionRateBps)
    entries = computeCommissionSplit({
      revenueCents: input.revenueCents,
      orgRateBps,
      repRateBps: Math.min(repRateBps, orgRateBps),
    })
  }

  try {
    const txn = await prisma.partnerTransaction.create({
      data: {
        clientId: client.id,
        orgId: org.id,
        repId,
        transactionDate: input.transactionDate,
        description: input.description ?? null,
        reference: input.reference ?? null,
        revenueCents: input.revenueCents,
        costCents,
        source: input.source,
        createdBy: input.createdBy,
        entries: {
          create: entries
            .filter((e) => e.amountCents > 0)
            .map((e) => ({
              orgId: org.id,
              repId: e.payee === 'REP' ? repId : null,
              payee: e.payee,
              kind: 'EARNING' as const,
              rateBps: e.rateBps,
              amountCents: e.amountCents,
              status: 'PENDING' as const,
            })),
        },
      },
      select: { id: true },
    })
    return { transactionId: txn.id }
  } catch (err) {
    if (isUniqueViolation(err)) return null
    throw err
  }
}

/**
 * Claw back commission proportionally to the order's cumulative refunds.
 * Writes REVERSAL entries per payee (delta since what was already reversed;
 * never un-reverses). Safe to call repeatedly.
 */
export async function reverseCommissionForOrder(orderId: string): Promise<void> {
  if (!prisma) return
  try {
    const txn = await prisma.partnerTransaction.findUnique({
      where: { reference: orderReference(orderId) },
      include: { entries: true },
    })
    if (!txn) return

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { total: true, refundedTotal: true },
    })
    if (!order) return

    const refundedCents = Math.min(
      dollarsToCents(Number(order.refundedTotal ?? 0)),
      txn.revenueCents
    )
    if (refundedCents <= 0) return

    // Group by payee identity (ORG, or a specific rep).
    const groups = new Map<
      string,
      { payee: 'ORG' | 'REP'; repId: string | null; earned: number; reversed: number; rateBps: number }
    >()
    for (const entry of txn.entries) {
      const key = `${entry.payee}:${entry.repId ?? ''}`
      const group =
        groups.get(key) ??
        ({ payee: entry.payee, repId: entry.repId, earned: 0, reversed: 0, rateBps: entry.rateBps } as const)
      const g = { ...group }
      if (entry.kind === 'EARNING') {
        g.earned += entry.amountCents
        g.rateBps = entry.rateBps
      } else {
        g.reversed += entry.amountCents
      }
      groups.set(key, g)
    }

    const creates: Array<{
      payee: 'ORG' | 'REP'
      repId: string | null
      rateBps: number
      amountCents: number
    }> = []
    for (const g of groups.values()) {
      const delta = reversalDelta({
        earningCents: g.earned,
        alreadyReversedCents: g.reversed,
        revenueCents: txn.revenueCents,
        refundedTotalCents: refundedCents,
      })
      if (delta > 0) {
        creates.push({ payee: g.payee, repId: g.repId, rateBps: g.rateBps, amountCents: delta })
      }
    }

    await prisma.$transaction([
      prisma.partnerTransaction.update({
        where: { id: txn.id },
        data: { refundedCents },
      }),
      ...creates.map((c) =>
        prisma!.commissionEntry.create({
          data: {
            transactionId: txn.id,
            orgId: txn.orgId,
            repId: c.repId,
            payee: c.payee,
            kind: 'REVERSAL',
            rateBps: c.rateBps,
            amountCents: c.amountCents,
            status: 'PENDING',
          },
        })
      ),
    ])

    if (creates.length > 0) {
      logger.info('[PARTNER ACCRUAL] Commission reversed', {
        orderId,
        refundedCents,
        reversals: creates.length,
      })
      void dispatchPartnerEvent(txn.orgId, 'commission.reversed', {
        reference: orderReference(orderId),
        clientId: txn.clientId,
        refundedCents,
        reversals: creates,
      })
    }
  } catch (err) {
    logger.warn('[PARTNER ACCRUAL] reversal failed (non-blocking)', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
