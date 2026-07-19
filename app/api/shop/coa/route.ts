import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { getPublishedCoasBySku } from '@/lib/coa'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shop/coa?sku=... — published COAs for a variant, for the catalog
 * "View COA" popup. Auth-gated (client portal); source-document links point
 * at the existing per-COA file proxy.
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const sku = new URL(request.url).searchParams.get('sku')?.trim()
    if (!sku) return errorResponse('sku is required', 400, 'VALIDATION_ERROR')

    const coas = await getPublishedCoasBySku(sku, (coaId) => `/api/shop/coa/${coaId}/file`)
    return successResponse({ coas })
  } catch (error) {
    logger.error('[shop/coa] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load COA')
  }
}
