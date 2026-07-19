import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  listInventoryAdjustments,
  createManualAdjustment,
  AdjustmentError,
} from '@/lib/inventory-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/inventory/adjustments
 * Recent inventory movements (receipts, fulfillment draws, returns, voids,
 * manual/import adjustments) with the acting user. Admin only.
 * Optional `variantId` scopes the log to one product variant.
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { searchParams } = new URL(request.url)
    const take = Math.min(500, Math.max(1, Number(searchParams.get('take')) || 200))
    const variantId = searchParams.get('variantId') || undefined

    const adjustments = await listInventoryAdjustments(take, variantId)
    return successResponse({ adjustments })
  } catch (error) {
    logger.error(
      'Error listing inventory adjustments',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list inventory adjustments')
  }
}

const createAdjustmentSchema = z.object({
  variantId: z.string().min(1),
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, 'Quantity change cannot be zero'),
  reason: z.enum(['MANUAL_ADJUSTMENT', 'DAMAGE', 'AUDIT', 'RETURN']),
  note: z.string().trim().max(500).optional(),
})

/**
 * POST /api/admin/inventory/adjustments
 * Record a manual stock correction (count fix, damage write-off, audit
 * true-up, return restock). Rejects removals that would take stock negative.
 * Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const parsed = createAdjustmentSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const adjustment = await createManualAdjustment(parsed.data, {
      clerkUserId: userId,
      label: userId,
    })

    logger.info('Manual inventory adjustment recorded', {
      variantId: parsed.data.variantId,
      delta: parsed.data.delta,
      reason: parsed.data.reason,
      by: userId,
    })

    return successResponse({ adjustment }, 201)
  } catch (error) {
    if (error instanceof AdjustmentError) {
      return errorResponse(error.message, error.code === 'NOT_FOUND' ? 404 : 400, error.code)
    }
    logger.error(
      'Error recording manual inventory adjustment',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to record inventory adjustment')
  }
}
