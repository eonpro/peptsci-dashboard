import { NextRequest } from 'next/server'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { getStripeDiagnostics } from '@/lib/stripe/config'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stripe/diagnostics (admin only)
 * Reports Stripe configuration + connectivity for troubleshooting.
 * Never returns secret values.
 */
export async function GET(_request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse()

    const diagnostics = await getStripeDiagnostics()
    return successResponse(diagnostics)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Diagnostics failed'
    logger.error('[STRIPE] diagnostics error', { message }, error as Error)
    return errorResponse(message)
  }
}
