import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { logger } from '@/lib/logger'
import { writeAudit } from '@/lib/audit'
import { copyClientPricing } from '@/lib/copy-client-pricing'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  sourceClientId: z.string().min(1, 'sourceClientId is required'),
  targetClientId: z.string().min(1, 'targetClientId is required'),
  replace: z.boolean().optional(),
  copyPaysAtCost: z.boolean().optional(),
})

/**
 * POST /api/admin/client-pricing/copy
 *
 * Copy another clinic's custom pricing model onto this one.
 * Default: replace (target SKUs not on the source are cleared) and copy
 * the source `paysAtCost` flag. SUPER_ADMIN only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, isSuperAdmin, userId } = await requireSuperAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin || !isSuperAdmin) {
      return forbiddenResponse('Super admin access required')
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const { sourceClientId, targetClientId, replace, copyPaysAtCost } = parsed.data
    const result = await copyClientPricing({
      sourceClientId,
      targetClientId,
      replace,
      copyPaysAtCost,
      createdBy: userId || undefined,
    })

    if (!result.success) {
      const status = result.error?.includes('not found')
        ? 404
        : result.error?.includes('itself')
          ? 400
          : 500
      return errorResponse(result.error || 'Failed to copy pricing', status)
    }

    void writeAudit({
      clerkUserId: userId,
      entity: 'ClientPricing',
      entityId: targetClientId,
      action: 'pricing_copied',
      metadata: {
        sourceClientId,
        targetClientId,
        copied: result.copied,
        cleared: result.cleared,
        paysAtCostCopied: result.paysAtCostCopied,
        sourcePaysAtCost: result.sourcePaysAtCost,
        replace: replace ?? true,
      },
    })

    return successResponse(result)
  } catch (error) {
    logger.error(
      'Client pricing copy failed',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to copy client pricing')
  }
}
