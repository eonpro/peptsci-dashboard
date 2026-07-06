/**
 * Weekly business report cron (Vercel Cron: Mondays, `0 13 * * 1`).
 *
 * Emails an internal summary (revenue WoW, AR, SLA, stock, top products) to the
 * configured report recipients. No-ops gracefully when EMAIL_ENABLED is unset.
 * Recipients come from REPORT_EMAIL_TO (comma-separated) or EMAIL_REPLY_TO.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { verifyCronAuth } from '@/lib/cron/auth'
import { getWeeklySummary } from '@/lib/reports/service'
import { nyDayString } from '@/lib/reports/core'
import { sendWeeklyReportEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function recipients(): string[] {
  const raw = process.env.REPORT_EMAIL_TO || process.env.EMAIL_REPLY_TO || ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// Send-idempotency marker, stored in AuditLog (entity/entityId indexed), so a
// cron retry or overlapping invocation on the same NY day never double-sends.
// Check-before-send narrows the race; a DB unique index on
// AuditLog(entity, entityId) would make it fully atomic (recommended follow-up).
const MARKER_ENTITY = 'cron:weekly-report'

async function alreadySent(periodKey: string): Promise<boolean> {
  if (!prisma) return false
  const marker = await prisma.auditLog.findFirst({
    where: { entity: MARKER_ENTITY, entityId: periodKey },
    select: { id: true },
  })
  return Boolean(marker)
}

async function recordSent(periodKey: string, meta: Record<string, unknown>): Promise<void> {
  if (!prisma) return
  try {
    await prisma.auditLog.create({
      data: {
        entity: MARKER_ENTITY,
        entityId: periodKey,
        action: 'SENT',
        metadata: meta as Prisma.InputJsonValue,
      },
    })
  } catch (err) {
    // P2002 = the partial unique index (cron:% markers) says another overlapping
    // run recorded the marker first — that's the dedup working, not an error.
    if ((err as { code?: string })?.code === 'P2002') return
    throw err
  }
}

async function run(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const to = recipients()
    if (to.length === 0) {
      logger.warn('[CRON weekly-report] no recipients (set REPORT_EMAIL_TO) — skipping')
      return NextResponse.json({ ok: true, skipped: 'no-recipients' })
    }

    // One send per NY calendar day: dedupes cron retries and overlapping runs.
    const periodKey = nyDayString(new Date())
    if (await alreadySent(periodKey)) {
      logger.info('[CRON weekly-report] already sent for period — skipping', { periodKey })
      return NextResponse.json({ ok: true, skipped: 'already-sent', periodKey })
    }

    const s = await getWeeklySummary()
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')
    const result = await sendWeeklyReportEmail({
      to,
      weekRange: `${day(s.weekStart)} – ${day(s.weekEnd)}`,
      revenue: usd(s.revenue.revenue),
      revenueDelta: `${s.revenueDeltaPct >= 0 ? '+' : ''}${s.revenueDeltaPct}%`,
      orders: s.revenue.orders,
      units: s.revenue.units,
      arOutstanding: usd(s.ar.total),
      arOverdue: `${usd(s.ar.net30 + s.ar.net60 + s.ar.net90 + s.ar.over90)} (${s.ar.overdueCount})`,
      slaPct: `${s.sla.withinSlaPct}%`,
      lowStockCount: s.lowStockCount,
      outOfStockCount: s.outOfStockCount,
      topProducts: s.topProducts.map((p) => ({ name: p.product, revenue: usd(p.revenue) })),
      dashboardUrl: `${appUrl}/reports`,
    })

    // Only record the marker on an actual successful send (a failed or
    // EMAIL_ENABLED-skipped send should not block a retry).
    if (result.ok && !result.skipped) {
      await recordSent(periodKey, { recipients: to.length, weekStart: s.weekStart, weekEnd: s.weekEnd })
    }

    logger.info('[CRON weekly-report] complete', { sent: result.ok, recipients: to.length })
    return NextResponse.json({ ok: true, sent: result.ok, skipped: result.skipped ?? false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'weekly report failed'
    logger.error('[CRON weekly-report] error', { message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
