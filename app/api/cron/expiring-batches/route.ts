/**
 * Expiring-batches cron (Vercel Cron: daily, `30 13 * * *` — see vercel.json).
 *
 * Alerts admins (in-app notification bell) for every inventory batch that
 * still has stock on hand and whose Beyond-Use Date falls within the warning
 * window (default 60 days; override with EXPIRING_BATCH_WINDOW_DAYS). Batches
 * already past their BUD are flagged URGENT. Deduped per batch per day via
 * the notification (sourceType, sourceId) dedup.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { verifyCronAuth } from '@/lib/cron/auth'
import { notifyAdmins } from '@/lib/notifications/service'
import { dailySourceId } from '@/lib/notifications/core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_WINDOW_DAYS = 60

function windowDays(): number {
  const raw = Number(process.env.EXPIRING_BATCH_WINDOW_DAYS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_WINDOW_DAYS
}

async function run(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, error: 'Database not connected' }, { status: 503 })
  }

  try {
    const days = windowDays()
    const now = new Date()
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    const batches = await prisma.inventoryBatch.findMany({
      where: {
        status: 'RECEIVED',
        qtyOnHand: { gt: 0 },
        bud: { lte: cutoff },
      },
      select: {
        id: true,
        batchNumber: true,
        productName: true,
        dose: true,
        bud: true,
        qtyOnHand: true,
      },
      orderBy: { bud: 'asc' },
    })

    let notified = 0
    for (const b of batches) {
      const daysLeft = Math.ceil((b.bud.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      const expired = daysLeft <= 0
      const budDate = b.bud.toISOString().slice(0, 10)
      const name = [b.productName, b.dose].filter(Boolean).join(' ')
      try {
        await notifyAdmins({
          category: 'INVENTORY',
          priority: expired ? 'URGENT' : 'HIGH',
          title: expired
            ? `Batch past BUD: ${b.batchNumber}`
            : `Batch expiring in ${daysLeft}d: ${b.batchNumber}`,
          message: expired
            ? `${name} batch ${b.batchNumber} passed its Beyond-Use Date (${budDate}) with ${b.qtyOnHand} units still on hand. Quarantine or void the remaining stock.`
            : `${name} batch ${b.batchNumber} reaches its Beyond-Use Date on ${budDate} (${daysLeft} days) with ${b.qtyOnHand} units on hand.`,
          actionUrl: '/inventory',
          sourceType: 'cron:expiring-batches',
          sourceId: dailySourceId(b.id),
          metadata: {
            batchId: b.id,
            batchNumber: b.batchNumber,
            bud: budDate,
            daysLeft,
            qtyOnHand: b.qtyOnHand,
          },
        })
        notified += 1
      } catch (e) {
        logger.warn('[CRON expiring-batches] notify failed (non-blocking)', {
          batchId: b.id,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    logger.info('[CRON expiring-batches] complete', {
      windowDays: days,
      expiring: batches.length,
      notified,
    })
    return NextResponse.json({ ok: true, windowDays: days, expiring: batches.length, notified })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'expiring-batches scan failed'
    logger.error('[CRON expiring-batches] error', { message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
