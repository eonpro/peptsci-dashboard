import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getInventorySummary } from '@/lib/inventory-summary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/inventory/summary?days=30
 * Workspace-wide KPI counters (on hand, available, active batches, low stock,
 * expiring, expired, reservations) plus the per-day movement series, reason
 * breakdown, top products by stock, and soonest-expiring batches. Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { searchParams } = new URL(request.url)
    const daysRaw = Number(searchParams.get('days'))
    const days = Number.isInteger(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : 30

    const summary = await getInventorySummary(days)
    return successResponse({ summary })
  } catch (error) {
    logger.error(
      'Error building inventory summary',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to build inventory summary')
  }
}
