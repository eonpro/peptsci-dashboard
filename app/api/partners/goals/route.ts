import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { commissionSummary, revenueSummary } from '@/lib/partners/queries'

export const dynamic = 'force-dynamic'

type Period = 'MONTH' | 'QUARTER' | 'YEAR'

function periodStart(period: Period, now = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  if (period === 'QUARTER') start.setMonth(Math.floor(now.getMonth() / 3) * 3)
  if (period === 'YEAR') start.setMonth(0)
  return start
}

/**
 * GET /api/partners/goals — the caller's goals with live progress. Org
 * sessions see org-level goals (repId null) plus per-rep goals; reps see only
 * their own.
 */
export async function GET() {
  try {
    const ctx = await requirePartner()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const goals = await prisma.partnerGoal.findMany({
      where: {
        orgId: ctx.org.id,
        ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}),
      },
      include: { rep: { select: { id: true, name: true } } },
      orderBy: [{ repId: 'asc' }, { period: 'asc' }, { metric: 'asc' }],
    })

    const rows = await Promise.all(
      goals.map(async (goal) => {
        const from = periodStart(goal.period as Period)
        const scope = {
          orgId: ctx.org.id,
          ...(goal.repId ? { repId: goal.repId } : {}),
          from,
        }
        let actualCents: number
        if (goal.metric === 'REVENUE') {
          actualCents = (await revenueSummary(scope)).revenueCents
        } else {
          const viewer = goal.repId ? 'REP' : 'ORG'
          const summary = await commissionSummary(scope, viewer)
          actualCents = summary.ownCents
        }
        return {
          id: goal.id,
          repId: goal.repId,
          repName: goal.rep?.name ?? null,
          metric: goal.metric,
          period: goal.period,
          targetCents: goal.targetCents,
          actualCents,
        }
      })
    )
    return successResponse({ goals: rows })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error loading goals', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load goals')
  }
}

const putSchema = z.object({
  repId: z.string().trim().min(1).nullable().optional(),
  metric: z.enum(['REVENUE', 'COMMISSION']),
  period: z.enum(['MONTH', 'QUARTER', 'YEAR']),
  /** Dollars; 0 deletes the goal. */
  target: z.number().min(0).max(100_000_000),
})

/**
 * PUT /api/partners/goals — set (or clear with target 0) a goal. Org ADMIN+
 * can set org-level and per-rep goals; reps set their own.
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await requirePartner({ minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = putSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { metric, period, target } = parsed.data

    // Reps can only manage their own goals.
    const repId = ctx.kind === 'REP' ? ctx.rep!.id : (parsed.data.repId ?? null)
    if (repId && ctx.kind === 'ORG') {
      const rep = await prisma.partnerRep.findFirst({
        where: { id: repId, orgId: ctx.org.id },
        select: { id: true },
      })
      if (!rep) return errorResponse('Rep not found in your org', 400, 'REP_NOT_FOUND')
    }

    // NULL repIds are distinct in the unique index, so org-level goals dedupe
    // manually (find + update/create) instead of via upsert.
    const existing = await prisma.partnerGoal.findFirst({
      where: { orgId: ctx.org.id, repId, metric, period },
      select: { id: true },
    })

    if (target <= 0) {
      if (existing) await prisma.partnerGoal.delete({ where: { id: existing.id } })
      return successResponse({ success: true, deleted: true })
    }

    const targetCents = Math.round(target * 100)
    if (existing) {
      await prisma.partnerGoal.update({ where: { id: existing.id }, data: { targetCents } })
    } else {
      await prisma.partnerGoal.create({
        data: { orgId: ctx.org.id, repId, metric, period, targetCents, createdBy: ctx.userId },
      })
    }
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error saving goal', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to save goal')
  }
}
