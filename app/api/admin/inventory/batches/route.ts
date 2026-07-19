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
import { createBatch, listBatches, BatchValidationError } from '@/lib/inventory-batches'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z
  .object({
    variantId: z.string().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    dose: z.string().trim().min(1).optional(),
    vialSize: z.string().trim().optional(),
    purity: z.string().trim().optional(),
    bud: z.string().min(1),
    receivedOn: z.string().optional(),
    qtyReceived: z.number().int().positive(),
    qtyDamaged: z.number().int().min(0).optional(),
    yearColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    notes: z.string().trim().optional(),
  })
  .refine((d) => d.variantId || (d.name && d.dose), {
    message: 'Provide a variantId or both a product name and dose',
  })

/** GET /api/admin/inventory/batches — list batches. Admin only. */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const { searchParams } = new URL(request.url)
    const status =
      (searchParams.get('status') as 'RECEIVED' | 'DEPLETED' | 'VOIDED' | 'ALL') || 'ALL'
    const search = searchParams.get('search') || undefined
    const variantId = searchParams.get('variantId') || undefined

    const batches = await listBatches({ status, search, variantId })
    return successResponse({ batches })
  } catch (error) {
    logger.error(
      'Error listing inventory batches',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list inventory batches')
  }
}

/** POST /api/admin/inventory/batches — record an intake + auto-create batch. Admin only. */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const batch = await createBatch(parsed.data, {
      clerkUserId: userId,
      label: userId,
    })

    logger.info('Inventory batch received', {
      batchNumber: batch.batchNumber,
      variantId: batch.variantId,
      qty: batch.qtyReceived,
      by: userId,
    })

    return successResponse({ batch }, 201)
  } catch (error) {
    if (error instanceof BatchValidationError) {
      return errorResponse(error.message, 400, 'VALIDATION_ERROR')
    }
    logger.error(
      'Error creating inventory batch',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create inventory batch')
  }
}
