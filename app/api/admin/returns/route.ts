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
import { createReturnRequest, listReturnRequests } from '@/lib/returns/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'LABEL_SENT',
  'IN_TRANSIT',
  'RECEIVED',
  'INSPECTED',
  'RESTOCKED',
  'REFUNDED',
  'CLOSED',
] as const

const createSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().optional(),
        variantId: z.string().optional(),
        productName: z.string().trim().min(1).max(200),
        quantity: z.number().int().positive().max(100000),
        condition: z.enum(['GOOD', 'DAMAGED', 'MISSING']).optional(),
        notes: z.string().trim().max(500).optional(),
      })
    )
    .min(1),
})

/** GET /api/admin/returns?status=&page=&pageSize= — paginated list. */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const url = new URL(request.url)
    const statusParam = url.searchParams.get('status')
    const status =
      statusParam && (RETURN_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as (typeof RETURN_STATUSES)[number])
        : undefined
    const page = Number(url.searchParams.get('page') ?? '1') || 1
    const pageSize = Number(url.searchParams.get('pageSize') ?? '50') || 50

    const result = await listReturnRequests({ status }, page, pageSize)
    return successResponse(result)
  } catch (error) {
    logger.error('[returns GET] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list returns')
  }
}

/** POST /api/admin/returns — open a new RMA for an order. */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }

    const created = await createReturnRequest({
      orderId: parsed.data.orderId,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      requestedById: userId ?? undefined,
      items: parsed.data.items,
    })

    return successResponse({ id: created.id, rmaNumber: created.rmaNumber, status: created.status }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create return'
    if (message === 'Order not found') return errorResponse(message, 404, 'NOT_FOUND')
    if (message.includes('at least one item') || message.includes('Invalid quantity')) {
      return errorResponse(message, 400, 'VALIDATION_ERROR')
    }
    logger.error('[returns POST] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to create return')
  }
}
