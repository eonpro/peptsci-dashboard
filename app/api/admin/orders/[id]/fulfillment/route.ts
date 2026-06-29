import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { advanceFulfillment, getOrderFulfillment } from '@/lib/fulfillment/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  action: z.enum(['pick', 'pack', 'reset']),
  verifiedItems: z
    .array(
      z.object({
        variantId: z.string(),
        productName: z.string(),
        expected: z.number().int().nonnegative(),
        packed: z.number().int().nonnegative(),
      })
    )
    .optional(),
})

/** GET — current pick/pack state for an order. Admin only. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const fulfillment = await getOrderFulfillment(id)
    return successResponse({ fulfillment })
  } catch (error) {
    logger.error(
      '[admin/orders/fulfillment] GET error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load fulfillment state')
  }
}

/** POST — advance pick → pack (or reset). Admin only. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse('Invalid request body', 400, 'INVALID_BODY')
    }

    const fulfillment = await advanceFulfillment(
      id,
      parsed.data.action,
      userId ?? 'unknown',
      parsed.data.verifiedItems
    )
    logger.info('[admin/orders/fulfillment] advanced', { orderId: id, action: parsed.data.action })
    return successResponse({ fulfillment })
  } catch (error) {
    if (error instanceof Error && error.message === 'Order not found') {
      return errorResponse('Order not found', 404, 'NOT_FOUND')
    }
    logger.error(
      '[admin/orders/fulfillment] POST error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update fulfillment state')
  }
}
