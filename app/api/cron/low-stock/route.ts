/**
 * Low-stock cron (Vercel Cron: daily, `0 13 * * *` — see vercel.json).
 *
 * Scans ACTIVE variants with a reorder level set and alerts admins (in-app
 * notification bell) for every variant whose available stock
 * (onHand - reserved) is at or below its reorder level. Deduped per variant
 * per day via the notification (sourceType, sourceId) dedup.
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

async function run(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, error: 'Database not connected' }, { status: 503 })
  }

  try {
    const variants = await prisma.productVariant.findMany({
      where: { status: 'ACTIVE', reorderLevel: { gt: 0 } },
      select: {
        id: true,
        sku: true,
        dose: true,
        inventoryOnHand: true,
        inventoryReserved: true,
        reorderLevel: true,
        product: { select: { name: true } },
      },
    })

    const lowStock = variants.filter(
      (v) => v.inventoryOnHand - v.inventoryReserved <= v.reorderLevel
    )

    let notified = 0
    for (const v of lowStock) {
      const available = v.inventoryOnHand - v.inventoryReserved
      const name = [v.product.name, v.dose].filter(Boolean).join(' ')
      try {
        await notifyAdmins({
          category: 'INVENTORY',
          priority: available <= 0 ? 'URGENT' : 'HIGH',
          title: available <= 0 ? `Out of stock: ${name}` : `Low stock: ${name}`,
          message: `${name}${v.sku ? ` (${v.sku})` : ''} has ${available} available (on hand ${v.inventoryOnHand}, reserved ${v.inventoryReserved}; reorder level ${v.reorderLevel}).`,
          actionUrl: '/inventory',
          sourceType: 'cron:low-stock',
          sourceId: dailySourceId(v.id),
          metadata: {
            variantId: v.id,
            available,
            onHand: v.inventoryOnHand,
            reserved: v.inventoryReserved,
            reorderLevel: v.reorderLevel,
          },
        })
        notified += 1
      } catch (e) {
        logger.warn('[CRON low-stock] notify failed (non-blocking)', {
          variantId: v.id,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    logger.info('[CRON low-stock] complete', {
      scanned: variants.length,
      lowStock: lowStock.length,
      notified,
    })
    return NextResponse.json({
      ok: true,
      scanned: variants.length,
      lowStock: lowStock.length,
      notified,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'low-stock scan failed'
    logger.error('[CRON low-stock] error', { message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
