/**
 * GET /api/shop/customers — list this practice's customers (patients).
 */

import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { listShopCustomers } from '@/lib/shop-customers'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const customers = await listShopCustomers(clientId)
    return successResponse({ customers })
  } catch (error) {
    logger.error(
      '[shop/customers] list error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load customers')
  }
}
