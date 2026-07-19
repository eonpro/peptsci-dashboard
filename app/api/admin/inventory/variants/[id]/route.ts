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
import { setReorderLevel, AdjustmentError } from '@/lib/inventory-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  reorderLevel: z.number().int().min(0),
})

/**
 * PATCH /api/admin/inventory/variants/[id]
 * Update stock-management settings on a variant (currently: reorder level).
 * Admin only.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const variant = await setReorderLevel(id, parsed.data.reorderLevel)
    logger.info('Reorder level updated', {
      variantId: id,
      reorderLevel: parsed.data.reorderLevel,
      by: userId,
    })
    return successResponse({ variant })
  } catch (error) {
    if (error instanceof AdjustmentError) {
      return errorResponse(error.message, error.code === 'NOT_FOUND' ? 404 : 400, error.code)
    }
    logger.error(
      'Error updating variant stock settings',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update variant')
  }
}
