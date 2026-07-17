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
  approvePartnerOrg,
  rejectPartnerOrg,
  PartnerProvisionError,
} from '@/lib/partners/provision'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  action: z.enum(['approve', 'reject']).default('approve'),
  reason: z.string().trim().max(1000).optional(),
})

/**
 * POST /api/admin/partners/[id]/approve — approve (activates + provisions the
 * owner's Clerk login + approval email) or reject (suspends + rejection email)
 * a partner application.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin || !userId) return forbiddenResponse('Admin access required')

    const { id } = await context.params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')

    if (parsed.data.action === 'reject') {
      await rejectPartnerOrg(id, parsed.data.reason, userId)
      return successResponse({ success: true, status: 'SUSPENDED' })
    }

    const result = await approvePartnerOrg(id, userId)
    return successResponse({ success: true, status: 'ACTIVE', invited: result.invited })
  } catch (error) {
    if (error instanceof PartnerProvisionError) {
      return errorResponse(error.message, error.status, error.code)
    }
    logger.error(
      'Error approving partner org',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update partner application')
  }
}
