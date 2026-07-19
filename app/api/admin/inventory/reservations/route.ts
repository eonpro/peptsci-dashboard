import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  getOrderReservations,
  listActiveReservations,
  listActiveReservationsPaged,
} from '@/lib/inventory/reservations'
import { parsePageParams } from '@/lib/inventory-workspace-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/inventory/reservations?orderId=&variantId=&page=&pageSize=&search=
 * - orderId          → all reservations for that order (any status)
 * - page / pageSize  → enriched, paginated active reservations (order #,
 *                      customer, order status) for the workspace tab;
 *                      `search` matches product / SKU / customer and
 *                      `variantId` scopes to one variant
 * - otherwise        → legacy un-paged active reservations
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const url = new URL(request.url)
    const orderId = url.searchParams.get('orderId')
    const variantId = url.searchParams.get('variantId') ?? undefined

    if (orderId) {
      const reservations = await getOrderReservations(orderId)
      return successResponse({ reservations })
    }

    if (url.searchParams.has('page') || url.searchParams.has('pageSize')) {
      const { page, pageSize } = parsePageParams(
        url.searchParams.get('page'),
        url.searchParams.get('pageSize')
      )
      const result = await listActiveReservationsPaged({
        variantId,
        search: url.searchParams.get('search') || undefined,
        page,
        pageSize,
      })
      return successResponse(result)
    }

    const reservations = await listActiveReservations(variantId)
    return successResponse({ reservations })
  } catch (error) {
    logger.error(
      '[inventory reservations] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list reservations')
  }
}
