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
    if (!txn.clientId) continue // program bonuses have no clinic
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

export interface LeaderboardRow {
  rank: number
  /** Anonymized except for the viewer's own row. */
  label: string
  revenueCents: number
  isYou: boolean
}

/**
 * Quarter-to-date revenue leaderboard across ACTIVE orgs, anonymized ("Partner
 * #N") except the caller's row. Motivates without leaking who's who.
 */
export async function orgLeaderboard(viewerOrgId: string, top = 10): Promise<LeaderboardRow[]> {
  const client = db()
  const start = new Date()
  start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3, 1)
  start.setUTCHours(0, 0, 0, 0)

  const grouped = await client.partnerTransaction.groupBy({
    by: ['orgId'],
    where: { transactionDate: { gte: start }, org: { status: 'ACTIVE' } },
    _sum: { revenueCents: true },
  })
  const sorted = grouped
    .map((g) => ({ orgId: g.orgId, revenueCents: g._sum.revenueCents ?? 0 }))
    .sort((a, b) => b.revenueCents - a.revenueCents)

  const rows: LeaderboardRow[] = []
  sorted.forEach((row, index) => {
    const isYou = row.orgId === viewerOrgId
    if (index < top || isYou) {
      rows.push({
        rank: index + 1,
        label: isYou ? 'You' : `Partner #${index + 1}`,
        revenueCents: row.revenueCents,
        isYou,
      })
    }
  })
  return rows
}

export interface ClickSeriesPoint {
  date: string // YYYY-MM-DD
  clicks: number
  uniques: number
}

export interface LinkAnalytics {
  series: ClickSeriesPoint[]
  totals: { clicks: number; uniques: number; signups: number }
  topSources: Array<{ source: string; clicks: number }>
}

/** Click timeseries + top UTM sources for the org's (or rep's) links. */
export async function linkAnalytics(scope: LedgerScope, days = 30): Promise<LinkAnalytics> {
  const client = db()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))

  const [clicks, signups] = await Promise.all([
    client.referralLinkClick.findMany({
      where: {
        link: { orgId: scope.orgId, ...(scope.repId ? { repId: scope.repId } : {}) },
        createdAt: { gte: start },
      },
      select: { createdAt: true, visitorHash: true, utmSource: true },
    }),
    client.referralLink.aggregate({
      where: { orgId: scope.orgId, ...(scope.repId ? { repId: scope.repId } : {}) },
      _sum: { signupCount: true },
    }),
  ])

  const byDay = new Map<string, { clicks: number; visitors: Set<string> }>()
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    byDay.set(d.toISOString().slice(0, 10), { clicks: 0, visitors: new Set() })
  }
  const allVisitors = new Set<string>()
  const sources = new Map<string, number>()
  for (const click of clicks) {
    const key = click.createdAt.toISOString().slice(0, 10)
    const bucket = byDay.get(key)
    if (bucket) {
      bucket.clicks += 1
      if (click.visitorHash) bucket.visitors.add(click.visitorHash)
    }
    if (click.visitorHash) allVisitors.add(click.visitorHash)
    const source = click.utmSource || 'direct'
    sources.set(source, (sources.get(source) ?? 0) + 1)
  }

  return {
    series: [...byDay.entries()].map(([date, b]) => ({
      date,
      clicks: b.clicks,
      uniques: b.visitors.size,
    })),
    totals: {
      clicks: clicks.length,
      uniques: allVisitors.size,
      signups: signups._sum.signupCount ?? 0,
    },
    topSources: [...sources.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, clicks: count })),
  }
}

export interface AcquisitionFunnel {
  clicks: number
  signups: number
  approvedClinics: number
  orderingClinics: number
  revenueCents: number
}

/** Lifetime funnel: clicks → signups → approved → ordering → revenue. */
export async function acquisitionFunnel(scope: LedgerScope): Promise<AcquisitionFunnel> {
  const client = db()
  const clientWhere = {
    partnerOrgId: scope.orgId,
    ...(scope.repId ? { partnerRepId: scope.repId } : {}),
  }
  const [clicks, signups, approved, ordering, revenue] = await Promise.all([
    client.referralLinkClick.count({
      where: { link: { orgId: scope.orgId, ...(scope.repId ? { repId: scope.repId } : {}) } },
    }),
    client.client.count({ where: clientWhere }),
    client.client.count({ where: { ...clientWhere, onboardingStatus: 'APPROVED' } }),
    client.partnerTransaction
      .findMany({
        where: { orgId: scope.orgId, ...(scope.repId ? { repId: scope.repId } : {}) },
        select: { clientId: true },
        distinct: ['clientId'],
      })
      .then((rows) => rows.length),
    client.partnerTransaction.aggregate({
      where: { orgId: scope.orgId, ...(scope.repId ? { repId: scope.repId } : {}) },
      _sum: { revenueCents: true },
    }),
  ])
  return {
    clicks,
    signups,
    approvedClinics: approved,
    orderingClinics: ordering,
    revenueCents: revenue._sum.revenueCents ?? 0,
  }
}

export interface MonthlyStatement {
  month: string // YYYY-MM
  earnedCents: number
  reversedCents: number
  paidCents: number
  closingUnpaidCents: number
}

/** Month-by-month statement roll-up for the viewer, oldest first. */
export async function monthlyStatements(
  scope: LedgerScope,
  viewer: 'ORG' | 'REP',
  months = 12
): Promise<MonthlyStatement[]> {
  const client = db()
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  start.setMonth(start.getMonth() - (months - 1))

  const payeeWhere =
    viewer === 'REP'
      ? { payee: 'REP' as const, repId: scope.repId ?? undefined }
      : { payee: 'ORG' as const }

  const [entries, payouts] = await Promise.all([
    client.commissionEntry.findMany({
      where: { orgId: scope.orgId, ...payeeWhere },
      select: { kind: true, amountCents: true, createdAt: true },
    }),
    client.partnerPayout.findMany({
      where: {
        orgId: scope.orgId,
        ...(viewer === 'REP' ? { payee: 'REP', repId: scope.repId ?? undefined } : { payee: 'ORG' }),
      },
      select: { amountCents: true, paidAt: true },
    }),
  ])

  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const rows = new Map<string, MonthlyStatement>()
  for (let i = 0; i < months; i++) {
    const d = new Date(start)
    d.setMonth(start.getMonth() + i)
    rows.set(monthKey(d), {
      month: monthKey(d),
      earnedCents: 0,
      reversedCents: 0,
      paidCents: 0,
      closingUnpaidCents: 0,
    })
  }

  // Running balance includes activity BEFORE the window so closing balances
  // are true, not window-relative.
  let runningBefore = 0
  for (const e of entries) {
    const amount = e.kind === 'REVERSAL' ? -e.amountCents : e.amountCents
    const row = rows.get(monthKey(e.createdAt))
    if (row) {
      if (e.kind === 'REVERSAL') row.reversedCents += e.amountCents
      else row.earnedCents += e.amountCents
    } else if (e.createdAt < start) {
      runningBefore += amount
    }
  }
  for (const p of payouts) {
    const row = rows.get(monthKey(p.paidAt))
    if (row) row.paidCents += p.amountCents
    else if (p.paidAt < start) runningBefore -= p.amountCents
  }

  let balance = runningBefore
  for (const row of rows.values()) {
    balance += row.earnedCents - row.reversedCents - row.paidCents
    row.closingUnpaidCents = balance
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
