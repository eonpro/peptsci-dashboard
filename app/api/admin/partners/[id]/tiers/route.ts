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

/** GET /api/admin/partners/[id]/tiers — the org's volume bonus tiers. */
export async function GET(_request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const tiers = await prisma.partnerRateTier.findMany({
      where: { orgId: id },
      orderBy: { thresholdCents: 'asc' },
    })
    return successResponse({ tiers })
  } catch (error) {
    logger.error('Error listing tiers', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list tiers')
  }
}

const putSchema = z.object({
  tiers: z
    .array(
      z.object({
        /** Quarter-to-date revenue threshold in dollars. */
        threshold: z.number().min(1).max(100_000_000),
        /** Bonus percent added to the base rate once reached. */
        bonusPercent: z.number().min(0.01).max(50),
      })
    )
    .max(10),
})

/** PUT /api/admin/partners/[id]/tiers — replace the org's tier ladder. */
export async function PUT(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const parsed = putSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    await prisma.$transaction([
      prisma.partnerRateTier.deleteMany({ where: { orgId: id } }),
      ...parsed.data.tiers.map((tier) =>
        prisma!.partnerRateTier.create({
          data: {
            orgId: id,
            thresholdCents: Math.round(tier.threshold * 100),
            bonusBps: Math.round(tier.bonusPercent * 100),
          },
        })
      ),
    ])
    logger.info('[ADMIN PARTNERS] Tiers replaced', { orgId: id, count: parsed.data.tiers.length })
    return successResponse({ success: true })
  } catch (error) {
    logger.error('Error saving tiers', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to save tiers')
  }
}
