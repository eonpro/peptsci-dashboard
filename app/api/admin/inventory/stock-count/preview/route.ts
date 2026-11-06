import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requirePermission,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { previewStockCount } from '@/lib/inventory/stock-count'
import { STOCK_COUNT_MAX_TEXT } from '@/lib/inventory/stock-count-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const previewSchema = z.object({
  text: z
    .string()
    .max(
      STOCK_COUNT_MAX_TEXT,
      `The pasted count is too long (max ${STOCK_COUNT_MAX_TEXT} characters)`
    ),
  zeroUnlisted: z.boolean().optional(),
})

/**
 * POST /api/admin/inventory/stock-count/preview
 * Read-only: match a pasted physical count ("BPC-157 5mg: 126", one or more
 * per line) to the catalog and return what applying it would change —
 * on-hand deltas, batch moves, warnings, and every line that needs a size or
 * SKU before it can apply. Requires catalog:write (same as applying).
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requirePermission('catalog:write')
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Inventory write access required')

    const parsed = previewSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const preview = await previewStockCount(parsed.data)
    return successResponse({ preview })
  } catch (error) {
    logger.error(
      'Error previewing stock count',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to preview the stock count')
  }
}
