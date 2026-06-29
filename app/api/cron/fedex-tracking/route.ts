/**
 * FedEx tracking poller cron (Vercel Cron: hourly, `0 * * * *`).
 *
 * Polls live FedEx status for non-terminal orders, writes status back onto the
 * Order, and notifies admins when a shipment is delivered. No-ops gracefully
 * when FedEx is unconfigured.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { verifyCronAuth } from '@/lib/cron/auth'
import { pollActiveFedExShipments } from '@/lib/shipping/fedex-tracking-poller'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

async function run(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await pollActiveFedExShipments()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FedEx tracking poll failed'
    logger.error('[CRON fedex-tracking] error', { message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
