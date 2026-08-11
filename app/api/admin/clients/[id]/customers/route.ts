/**
 * GET /api/admin/clients/[id]/customers — admin view of practice customers.
 */

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
import { listShopCustomers } from '@/lib/shop-customers'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId } = await params
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    const customers = await listShopCustomers(clientId)
    return successResponse({ customers })
  } catch (error) {
    logger.error(
      '[admin/clients/customers] list error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load customers')
  }
}
