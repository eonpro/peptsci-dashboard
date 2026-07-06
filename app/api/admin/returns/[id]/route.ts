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
import { getReturnRequest, updateReturnStatus } from '@/lib/returns/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  status: z.enum([
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
  ]),
  refundAmount: z.number().nonnegative().max(1_000_000).optional(),
  notes: z.string().trim().max(2000).optional(),
})

/** GET /api/admin/returns/[id] — full RMA detail. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const found = await getReturnRequest(id)
    if (!found) return errorResponse('Return not found', 404, 'NOT_FOUND')
    return successResponse(found)
  } catch (error) {
    logger.error('[returns GET id] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load return')
  }
}

/** PATCH /api/admin/returns/[id] — advance status / set refund / notes. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }

    // RESTOCKED is a system outcome of the restock action (POST .../restock),
    // not a manual step. Allowing a manual jump to RESTOCKED would make items
    // ineligible for the actual restock and silently skip returning stock.
    if (parsed.data.status === 'RESTOCKED') {
      return errorResponse(
        'Use the restock action to restock items; RESTOCKED cannot be set manually',
        400,
        'USE_RESTOCK_ACTION'
      )
    }

    const updated = await updateReturnStatus(id, parsed.data.status, {
      refundAmount: parsed.data.refundAmount,
      notes: parsed.data.notes,
      actorId: userId ?? undefined,
    })

    return successResponse({ id: updated.id, status: updated.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update return'
    if (message === 'Return not found') return errorResponse(message, 404, 'NOT_FOUND')
    if (message.startsWith('Cannot move return')) return errorResponse(message, 409, 'INVALID_TRANSITION')
    logger.error('[returns PATCH] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update return')
  }
}
