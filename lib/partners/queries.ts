/**
 * Shared partner-ledger queries used by the admin section, the partner
 * portal, the exports, and the read-only partner API.
 *
 * Rollup convention: REVERSAL entries subtract from EARNING entries per
 * (payee, status) group, so downstream summaries (summarizeCommissionRows)
 * see net numbers and a fully-refunded transaction nets to zero.
 */

import { prisma } from '@/lib/prisma'
import {
  summarizeCommissionRows,
  type CommissionRollupRow,
  type CommissionSummary,
} from './commission'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

export interface LedgerScope {
  orgId: string
  /** Restrict to one rep's share (rep sessions). */
  repId?: string
  from?: Date
  to?: Date
}

function entryWhere(scope: LedgerScope) {
  return {
    orgId: scope.orgId,
    ...(scope.repId ? { repId: scope.repId, payee: 'REP' as const } : {}),
    ...(scope.from || scope.to
      ? { createdAt: { ...(scope.from ? { gte: scope.from } : {}), ...(scope.to ? { lte: scope.to } : {}) } }
      : {}),
  }
}

/** Net (EARNING − REVERSAL) ledger rows grouped by payee × status. */
export async function commissionRollup(scope: LedgerScope): Promise<CommissionRollupRow[]> {
  const grouped = await db().commissionEntry.groupBy({
    by: ['payee', 'status', 'kind'],
    where: entryWhere(scope),
    _sum: { amountCents: true },
  })
  const net = new Map<string, CommissionRollupRow>()
  for (const g of grouped) {
    const key = `${g.payee}:${g.status}`
    const row = net.get(key) ?? { payee: g.payee, status: g.status, totalCents: 0 }
    const amount = g._sum.amountCents ?? 0
    row.totalCents += g.kind === 'REVERSAL' ? -amount : amount
    net.set(key, row)
  }
  return [...net.values()]
}

/** Headline dashboard numbers for a viewer (org sees rep carve-outs too). */
export async function commissionSummary(
  scope: LedgerScope,
  viewer: 'ORG' | 'REP'
): Promise<CommissionSummary> {
  return summarizeCommissionRows(await commissionRollup(scope), viewer)
}

export interface RevenueSummary {
  revenueCents: number
  refundedCents: number
  transactionCount: number
  clinicCount: number
}

/** Attributed revenue totals for an org (optionally one rep's book). */
export async function revenueSummary(scope: LedgerScope): Promise<RevenueSummary> {
  const where = {
    orgId: scope.orgId,
    ...(scope.repId ? { repId: scope.repId } : {}),
    ...(scope.from || scope.to
      ? {
          transactionDate: {
            ...(scope.from ? { gte: scope.from } : {}),
            ...(scope.to ? { lte: scope.to } : {}),
          },
        }
      : {}),
  }
  const [agg, clinics] = await Promise.all([
    db().partnerTransaction.aggregate({
      where,
      _sum: { revenueCents: true, refundedCents: true },
      _count: { _all: true },
    }),
    db().partnerTransaction.findMany({ where, select: { clientId: true }, distinct: ['clientId'] }),
  ])
  return {
    revenueCents: agg._sum.revenueCents ?? 0,
    refundedCents: agg._sum.refundedCents ?? 0,
    transactionCount: agg._count._all,
    clinicCount: clinics.length,
  }
}

export interface MonthlyTrendPoint {
  /** e.g. "2026-03" */
  month: string
  revenueCents: number
  commissionCents: number
}

/**
 * Last `months` months of attributed revenue + viewer commission, oldest
 * first. Aggregated in JS (partner volumes are small).
 */
export async function monthlyTrend(
  scope: LedgerScope,
  viewer: 'ORG' | 'REP',
  months = 12
): Promise<MonthlyTrendPoint[]> {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  start.setMonth(start.getMonth() - (months - 1))

  const txns = await db().partnerTransaction.findMany({
    where: {
      orgId: scope.orgId,
      ...(scope.repId ? { repId: scope.repId } : {}),
      transactionDate: { gte: start },
    },
    select: {
      transactionDate: true,
      revenueCents: true,
      entries: { select: { payee: true, kind: true, amountCents: true, repId: true } },
    },
  })

  const points = new Map<string, MonthlyTrendPoint>()
  for (let i = 0; i < months; i++) {
    const d = new Date(start)
    d.setMonth(start.getMonth() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    points.set(key, { month: key, revenueCents: 0, commissionCents: 0 })
  }

  for (const txn of txns) {
    const d = txn.transactionDate
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const point = points.get(key)
    if (!point) continue
    point.revenueCents += txn.revenueCents
    for (const entry of txn.entries) {
      const mine =
        viewer === 'ORG' ? entry.payee === 'ORG' : entry.payee === 'REP' && entry.repId === scope.repId
      if (!mine) continue
      point.commissionCents += entry.kind === 'REVERSAL' ? -entry.amountCents : entry.amountCents
    }
  }
  return [...points.values()]
}

export interface ClinicBookRow {
  clientId: string
  organizationName: string
  contactName: string | null
  repId: string | null
  repName: string | null
  stage: string
  createdAt: Date
  revenueCents: number
  commissionCents: number
  lastOrderAt: Date | null
}

/** The org's (or rep's) book of business with lifetime revenue/commission. */
export async function clinicBook(scope: LedgerScope, viewer: 'ORG' | 'REP'): Promise<ClinicBookRow[]> {
  const client = db()
  const clients = await client.client.findMany({
    where: {
      partnerOrgId: scope.orgId,
      ...(scope.repId ? { partnerRepId: scope.repId } : {}),
    },
    select: {
      id: true,
      organizationName: true,
      contactName: true,
      partnerRepId: true,
      partnerRep: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  if (clients.length === 0) return []

  const clientIds = clients.map((c) => c.id)
  const [txns, meta] = await Promise.all([
    client.partnerTransaction.findMany({
      where: { orgId: scope.orgId, clientId: { in: clientIds } },
      select: {
        clientId: true,
        revenueCents: true,
        transactionDate: true,
        entries: { select: { payee: true, kind: true, amountCents: true, repId: true } },
      },
    }),
    client.partnerClinicMeta.findMany({
      where: { orgId: scope.orgId, clientId: { in: clientIds } },
      select: { clientId: true, stage: true },
    }),
  ])
  const stageByClient = new Map(meta.map((m) => [m.clientId, m.stage as string]))

  const rows = new Map<string, ClinicBookRow>()
  for (const c of clients) {
    rows.set(c.id, {
      clientId: c.id,
      organizationName: c.organizationName,
      contactName: c.contactName,
      repId: c.partnerRepId,
      repName: c.partnerRep?.name ?? null,
      stage: stageByClient.get(c.id) ?? 'ACTIVE',
      createdAt: c.createdAt,
      revenueCents: 0,
      commissionCents: 0,
      lastOrderAt: null,
    })
  }
  for (const txn of txns) {
    const row = rows.get(txn.clientId)
    if (!row) continue
    row.revenueCents += txn.revenueCents
    if (!row.lastOrderAt || txn.transactionDate > row.lastOrderAt) row.lastOrderAt = txn.transactionDate
    for (const entry of txn.entries) {
      const mine =
        viewer === 'ORG' ? entry.payee === 'ORG' : entry.payee === 'REP' && entry.repId === scope.repId
      if (!mine) continue
      row.commissionCents += entry.kind === 'REVERSAL' ? -entry.amountCents : entry.amountCents
    }
  }
  return [...rows.values()]
}

/**
 * Net APPROVED balance ready to be paid out to a payee (org share or one
 * rep's share). Payouts flip exactly these entries to PAID.
 */
export async function approvedBalance(
  orgId: string,
  payee: 'ORG' | 'REP',
  repId?: string | null
): Promise<{ amountCents: number; entryIds: string[] }> {
  const entries = await db().commissionEntry.findMany({
    where: {
      orgId,
      payee,
      status: 'APPROVED',
      ...(payee === 'REP' ? { repId: repId ?? undefined } : {}),
    },
    select: { id: true, kind: true, amountCents: true },
  })
  let amountCents = 0
  for (const e of entries) amountCents += e.kind === 'REVERSAL' ? -e.amountCents : e.amountCents
  return { amountCents, entryIds: entries.map((e) => e.id) }
}
