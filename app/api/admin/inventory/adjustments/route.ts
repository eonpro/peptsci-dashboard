import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { listInventoryAdjustments } from '@/lib/inventory-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/inventory/adjustments
 * Recent inventory movements (receipts, fulfillment draws, returns, voids,
 * manual/import adjustments) with the acting user. Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { searchParams } = new URL(request.url)
    const take = Math.min(500, Math.max(1, Number(searchParams.get('take')) || 200))

    const adjustments = await listInventoryAdjustments(take)
    return successResponse({ adjustments })
  } catch (error) {
    logger.error(
      'Error listing inventory adjustments',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list inventory adjustments')
  }
}
