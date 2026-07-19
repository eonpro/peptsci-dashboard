import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { listCatalogStock } from '@/lib/inventory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/inventory/catalog
 * Every ACTIVE catalog variant with stock counters + batch aggregates (count,
 * soonest BUD) — the workspace's By Product / Low Stock data. Admin only.
 */
export async function GET() {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    const catalog = await listCatalogStock()
    return successResponse({ catalog })
  } catch (error) {
    logger.error(
      'Error listing inventory catalog',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list inventory catalog')
  }
}
