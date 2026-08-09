/**
 * POST /api/admin/clients/[id]/shopify/inbounds/[inboundId]/process
 * Manually (re)run invoice → charge → fulfill for a fully-mapped inbound.
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
import { processShopifyInbound } from '@/lib/shopify/process-inbound'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; inboundId: string }> }
) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId, inboundId } = await params
    const inbound = await prisma.shopifyInboundOrder.findFirst({
      where: { id: inboundId, clientId },
      select: { id: true },
    })
    if (!inbound) return errorResponse('Inbound order not found', 404, 'NOT_FOUND')

    const result = await processShopifyInbound(inbound.id)
    return successResponse({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Process failed'
    logger.error('[SHOPIFY PROCESS] error', { message }, error as Error)
    return errorResponse(message)
  }
}
