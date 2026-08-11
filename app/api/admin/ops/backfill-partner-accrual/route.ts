/**
 * SUPER_ADMIN ops: accrue partner commissions for historical CAPTURED orders
 * that were minted without calling accrueCommissionForOrder.
 *
 * POST /api/admin/ops/backfill-partner-accrual
 *   {} or { "dryRun": true }           → list candidates (no writes)
 *   { "confirm": true }                → call accrueCommissionForOrder per order
 *   optional { "clientId", "partnerOrgId", "take" }
 */

import { NextRequest } from 'next/server'
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { writeAudit } from '@/lib/audit'
import { accrueCommissionForOrder } from '@/lib/partners/accrual'
import { findPartnerAccrualCandidates } from '@/lib/ops/backfill-partner-accrual'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated, isSuperAdmin } = await requireSuperAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isSuperAdmin) return forbiddenResponse('Super admin required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const body = (await request.json().catch(() => ({}))) as {
      dryRun?: boolean
      confirm?: boolean
      clientId?: string
      partnerOrgId?: string
      take?: number
    }
    const dryRun = body.confirm !== true
    const take =
      typeof body.take === 'number' && Number.isFinite(body.take)
        ? Math.floor(body.take)
        : undefined

    const candidates = await findPartnerAccrualCandidates({
      clientId: body.clientId,
      partnerOrgId: body.partnerOrgId,
      take,
    })

    if (dryRun) {
      return successResponse({
        dryRun: true,
        planned: candidates,
        totals: {
          orders: candidates.length,
          revenueCents: candidates.reduce((s, c) => s + c.revenueCents, 0),
        },
      })
    }

    const accrued: Array<{
      orderId: string
      orderNumber: number
      partnerOrgId: string
      reference: string
      status: 'accrued' | 'skipped_no_ledger'
    }> = []
    const failed: Array<{ orderId: string; orderNumber: number; reason: string }> = []

    for (const c of candidates) {
      try {
        await accrueCommissionForOrder(c.orderId)
        const row = await prisma.partnerTransaction.findUnique({
          where: { reference: c.reference },
          select: { id: true },
        })
        const status = row ? 'accrued' : 'skipped_no_ledger'
        accrued.push({
          orderId: c.orderId,
          orderNumber: c.orderNumber,
          partnerOrgId: c.partnerOrgId,
          reference: c.reference,
          status,
        })

        void writeAudit({
          clerkUserId: userId,
          entity: 'Order',
          entityId: c.orderId,
          action: 'ops_backfill_partner_accrual',
          orderId: c.orderId,
          metadata: {
            orderNumber: c.orderNumber,
            partnerOrgId: c.partnerOrgId,
            reference: c.reference,
            status,
            revenueCents: c.revenueCents,
          },
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('[ops backfill-partner-accrual] order failed', {
          orderId: c.orderId,
          orderNumber: c.orderNumber,
          error: message,
        })
        failed.push({
          orderId: c.orderId,
          orderNumber: c.orderNumber,
          reason: message.slice(0, 300),
        })
      }
    }

    logger.info('[ops] backfill-partner-accrual complete', {
      accrued: accrued.filter((a) => a.status === 'accrued').length,
      skipped: accrued.filter((a) => a.status === 'skipped_no_ledger').length,
      failed: failed.length,
    })

    return successResponse({
      dryRun: false,
      accrued,
      failed,
      totals: {
        accrued: accrued.filter((a) => a.status === 'accrued').length,
        skippedNoLedger: accrued.filter((a) => a.status === 'skipped_no_ledger').length,
        failed: failed.length,
        revenueCentsPlanned: candidates.reduce((s, c) => s + c.revenueCents, 0),
      },
    })
  } catch (error) {
    logger.error(
      '[ops backfill-partner-accrual]',
      {},
      error instanceof Error ? error : undefined
    )
    return errorResponse('Failed to backfill partner accrual')
  }
}
