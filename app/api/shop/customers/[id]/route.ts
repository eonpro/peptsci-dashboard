/**
 * GET /api/shop/customers/[id] — one customer + their orders.
 */

import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { getShopCustomer } from '@/lib/shop-customers'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const customer = await getShopCustomer(clientId, id)
    if (!customer) return errorResponse('Customer not found', 404, 'NOT_FOUND')

    return successResponse({ customer })
  } catch (error) {
    logger.error(
      '[shop/customers/:id] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load customer')
  }
}
