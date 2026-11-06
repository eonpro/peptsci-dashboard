import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  requirePermission,
  currentActorLabel,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { applyStockCount, StockCountError } from '@/lib/inventory/stock-count'
import { STOCK_COUNT_MAX_LINES } from '@/lib/inventory/stock-count-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD')

const applySchema = z.object({
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1),
        counted: z.number().int().min(0),
        expectedOnHand: z.number().int(),
        expectedBatchTotal: z.number().int().min(0),
        newBatchBud: day.nullish(),
        label: z.string().max(200).nullish(),
      })
    )
    .min(1, 'A stock count needs at least one line')
    .max(STOCK_COUNT_MAX_LINES, `A stock count can hold at most ${STOCK_COUNT_MAX_LINES} lines`),
  countedOn: day.nullish(),
  note: z.string().trim().max(500).nullish(),
})

/**
 * POST /api/admin/inventory/stock-count
 * Apply a previewed physical count in one transaction: set each variant's
 * on-hand to the counted number, move its batches to match, and audit the
 * whole count. 409 STOCK_CHANGED (nothing written) when stock moved since the
 * preview — re-preview and apply again. Requires catalog:write.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requirePermission('catalog:write')
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Inventory write access required')

    const parsed = applySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const result = await applyStockCount(parsed.data, {
      clerkUserId: userId,
      label: await currentActorLabel(userId),
    })
    return successResponse({ result }, 201)
  } catch (error) {
    if (error instanceof StockCountError) {
      if (error.code === 'STOCK_CHANGED') {
        return NextResponse.json(
          {
            error: 'Conflict',
            message: error.message,
            code: error.code,
            conflicts: error.conflicts,
          },
          { status: 409 }
        )
      }
      return errorResponse(error.message, error.code === 'NOT_FOUND' ? 404 : 400, error.code)
    }
    logger.error(
      'Error applying stock count',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to apply the stock count')
  }
}
