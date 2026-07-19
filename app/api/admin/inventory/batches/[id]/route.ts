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
import { getBatch, updateBatch, voidBatch, BatchValidationError } from '@/lib/inventory-batches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  purity: z.string().trim().optional(),
  vialSize: z.string().trim().optional(),
  yearColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  notes: z.string().trim().optional(),
})

/** GET /api/admin/inventory/batches/[id] — batch detail + audit timeline. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { id } = await params
    const batch = await getBatch(id)
    if (!batch) return errorResponse('Batch not found', 404, 'NOT_FOUND')
    return successResponse({ batch })
  } catch (error) {
    logger.error(
      'Error fetching batch',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to fetch batch')
  }
}

/** PATCH /api/admin/inventory/batches/[id] — edit label-cosmetic fields. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { id } = await params
    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const batch = await updateBatch(id, parsed.data, { clerkUserId: userId, label: userId })
    return successResponse({ batch })
  } catch (error) {
    if (error instanceof BatchValidationError) {
      return errorResponse(error.message, 400, 'VALIDATION_ERROR')
    }
    logger.error(
      'Error updating batch',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update batch')
  }
}

/** DELETE /api/admin/inventory/batches/[id] — void the batch (reverses on-hand). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const reason = searchParams.get('reason') || 'Voided by admin'
    const batch = await voidBatch(id, reason, { clerkUserId: userId, label: userId })
    logger.info('Inventory batch voided', { batchId: id, by: userId })
    return successResponse({ batch })
  } catch (error) {
    if (error instanceof BatchValidationError) {
      return errorResponse(error.message, 404, 'NOT_FOUND')
    }
    logger.error(
      'Error voiding batch',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to void batch')
  }
}
