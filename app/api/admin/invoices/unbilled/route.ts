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

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** GET /api/admin/invoices/unbilled?clientId=&from=&to= — unbilled orders (optional create-date range). */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const sp = new URL(request.url).searchParams
    const clientId = sp.get('clientId')
    if (!clientId) return errorResponse('clientId is required', 400, 'CLIENT_REQUIRED')

    const from = sp.get('from')
    const to = sp.get('to')
    if (from && !YMD.test(from)) return errorResponse('from must be YYYY-MM-DD', 400, 'INVALID_FROM')
    if (to && !YMD.test(to)) return errorResponse('to must be YYYY-MM-DD', 400, 'INVALID_TO')

    const orders = await getUnbilledOrders(clientId, { from, to })
    return successResponse({ orders })
  } catch (error) {
    logger.error('[admin/invoices/unbilled] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load unbilled orders')
  }
}
