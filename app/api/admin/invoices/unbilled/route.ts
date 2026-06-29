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
import { getUnbilledOrders } from '@/lib/invoicing/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/invoices/unbilled?clientId= — orders not yet on any invoice. */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = new URL(request.url).searchParams.get('clientId')
    if (!clientId) return errorResponse('clientId is required', 400, 'CLIENT_REQUIRED')

    const orders = await getUnbilledOrders(clientId)
    return successResponse({ orders })
  } catch (error) {
    logger.error('[admin/invoices/unbilled] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load unbilled orders')
  }
}
