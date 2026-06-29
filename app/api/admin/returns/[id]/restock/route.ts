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
import { restockReturnItems } from '@/lib/returns/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/returns/[id]/restock — restock all eligible (GOOD,
 * not-yet-restocked) items back into inventory. Idempotent.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const result = await restockReturnItems(id, userId ?? undefined)
    return successResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restock return'
    if (message === 'Return not found') return errorResponse(message, 404, 'NOT_FOUND')
    logger.error('[returns restock] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to restock return')
  }
}
