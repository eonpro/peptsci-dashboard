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
import { getOrderReservations, listActiveReservations } from '@/lib/inventory/reservations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/inventory/reservations?orderId=&variantId=
 * - orderId   → all reservations for that order (any status)
 * - variantId → active reservations for that variant
 * - neither   → most recent active reservations
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

    const reservations = orderId
      ? await getOrderReservations(orderId)
      : await listActiveReservations(variantId)

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
