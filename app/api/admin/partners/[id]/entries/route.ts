import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const approveSchema = z.object({
  action: z.literal('approve'),
  /** Specific entry ids, or omit with all=true to approve every PENDING row. */
  entryIds: z.array(z.string().min(1)).max(1000).optional(),
  all: z.boolean().optional(),
})

/**
 * PATCH /api/admin/partners/[id]/entries — approve PENDING ledger entries
 * (both earnings and reversals), making them payable.
 */
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const parsed = approveSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { entryIds, all } = parsed.data
    if (!all && (!entryIds || entryIds.length === 0)) {
      return errorResponse('Provide entryIds or all: true', 400, 'NOTHING_TO_APPROVE')
    }

    const result = await prisma.commissionEntry.updateMany({
      where: {
        orgId: id,
        status: 'PENDING',
        ...(all ? {} : { id: { in: entryIds! } }),
      },
      data: { status: 'APPROVED' },
    })

    logger.info('[ADMIN PARTNERS] Entries approved', { orgId: id, count: result.count })
    return successResponse({ approved: result.count })
  } catch (error) {
    logger.error(
      'Error approving entries',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to approve entries')
  }
}
