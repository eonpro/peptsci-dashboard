/**
 * Partner daily cron (Vercel Cron: `30 12 * * *` UTC — see vercel.json).
 *
 * 1. Auto-approves PENDING commission entries older than each org's
 *    refund-hold window (Wave 3) — orgs with autoApproveEntries only.
 * 2. Expires stale protected leads (Wave 1).
 * 3. Emails each opted-in org a digest of yesterday's earnings (Wave 2).
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { verifyCronAuth } from '@/lib/cron/auth'
import { expireStaleLeads } from '@/lib/partners/leads'
import { commissionSummary } from '@/lib/partners/queries'
import { formatCents } from '@/lib/partners/commission'
import { sendPartnerDailyDigestEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

async function run(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, error: 'Database not connected' }, { status: 503 })
  }

  const results = { autoApproved: 0, leadsExpired: 0, digestsSent: 0 }
  try {
    // ── 1. Auto-approve entries past each org's hold window ──
    const orgs = await prisma.partnerOrg.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactName: true,
        notifyByEmail: true,
        autoApproveEntries: true,
        holdDays: true,
      },
    })
    for (const org of orgs) {
      if (!org.autoApproveEntries) continue
      const cutoff = new Date(Date.now() - org.holdDays * 24 * 60 * 60 * 1000)
      const flipped = await prisma.commissionEntry.updateMany({
        where: { orgId: org.id, status: 'PENDING', createdAt: { lt: cutoff } },
        data: { status: 'APPROVED' },
      })
      results.autoApproved += flipped.count
    }

    // ── 2. Expire stale leads ──
    results.leadsExpired = await expireStaleLeads()

    // ── 3. Daily digests (yesterday UTC) ──
    const dayEnd = new Date()
    dayEnd.setUTCHours(0, 0, 0, 0)
    const dayStart = new Date(dayEnd.getTime() - 24 * 60 * 60 * 1000)
    const dateLabel = dayStart.toISOString().slice(0, 10)

    for (const org of orgs) {
      if (!org.notifyByEmail) continue
      const [entriesAgg, txnCount, summary] = await Promise.all([
        prisma.commissionEntry.aggregate({
          where: {
            orgId: org.id,
            payee: 'ORG',
            kind: 'EARNING',
            createdAt: { gte: dayStart, lt: dayEnd },
          },
          _sum: { amountCents: true },
        }),
        prisma.partnerTransaction.count({
          where: { orgId: org.id, createdAt: { gte: dayStart, lt: dayEnd } },
        }),
        commissionSummary({ orgId: org.id }, 'ORG'),
      ])
      const earnedCents = entriesAgg._sum.amountCents ?? 0
      if (earnedCents <= 0) continue // nothing to report — no spam

      await sendPartnerDailyDigestEmail({
        to: org.contactEmail,
        contactName: org.contactName,
        dateLabel,
        earned: formatCents(earnedCents),
        transactionCount: txnCount,
        unpaid: formatCents(summary.unpaidCents),
      })
      results.digestsSent += 1
    }

    logger.info('[CRON partner-daily] complete', results)
    return NextResponse.json({ ok: true, ...results })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('[CRON partner-daily] failed', { message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
