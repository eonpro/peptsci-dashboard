import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { listClientOrders } from '@/lib/shop-orders'

export const dynamic = 'force-dynamic'

/** GET /api/shop/orders — the authenticated client's orders (most recent first). */
export async function GET(_request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const orders = await listClientOrders(clientId)

    return successResponse({ orders })
  } catch (error) {
    logger.error('[shop/orders] list error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load orders')
  }
}
