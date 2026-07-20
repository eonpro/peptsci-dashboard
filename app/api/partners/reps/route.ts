import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { invitePartnerRep, PartnerProvisionError } from '@/lib/partners/provision'
import { validateRepRateBps } from '@/lib/partners/commission'
import { commissionSummary, revenueSummary } from '@/lib/partners/queries'

export const dynamic = 'force-dynamic'

/** GET /api/partners/reps — org-only: reps with their numbers. */
export async function GET() {
  try {
    const ctx = await requirePartner({ orgOnly: true })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const reps = await prisma.partnerRep.findMany({
      where: { orgId: ctx.org.id },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { clients: true, referralLinks: true } } },
    })

    const rows = await Promise.all(
      reps.map(async (rep) => {
        const [summary, revenue] = await Promise.all([
          commissionSummary({ orgId: ctx.org.id, repId: rep.id }, 'REP'),
          revenueSummary({ orgId: ctx.org.id, repId: rep.id }),
        ])
        return {
          id: rep.id,
          name: rep.name,
          email: rep.email,
          phone: rep.phone,
          status: rep.status,
          commissionRateBps: rep.commissionRateBps,
          hasLogin: Boolean(rep.clerkUserId),
          msaSignedAt: rep.msaSignedAt,
          invitedAt: rep.invitedAt,
          clinicCount: rep._count.clients,
          linkCount: rep._count.referralLinks,
          revenueCents: revenue.revenueCents,
          earnedCents: summary.ownCents,
          unpaidCents: summary.unpaidCents,
          paidCents: summary.paidCents,
        }
      })
    )
    return successResponse({ reps: rows, orgRateBps: ctx.org.commissionRateBps })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error listing reps', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list reps')
  }
}

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  /** Percent (e.g. 2.5), converted to bps server-side. */
  ratePercent: z.number().min(0).max(100),
})

/** POST /api/partners/reps — invite a rep (org ADMIN+). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    const parsed = inviteSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const rateBps = Math.round(parsed.data.ratePercent * 100)
    // For MARGIN orgs the rep share is a % of margin (≤ 100%); for COMMISSION
    // orgs the carve-out can't exceed the org's own rate.
    if (ctx.org.compensationModel === 'COMMISSION') {
      const err = validateRepRateBps(rateBps, ctx.org.commissionRateBps)
      if (err) return errorResponse(err, 400, 'RATE_INVALID')
    }

    const result = await invitePartnerRep(ctx.org.id, {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      commissionRateBps: rateBps,
    })
    return successResponse({ success: true, repId: result.repId }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    if (error instanceof PartnerProvisionError) return errorResponse(error.message, error.status, error.code)
    logger.error('Error inviting rep', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to invite rep')
  }
}

const patchSchema = z.object({
  repId: z.string().trim().min(1),
  ratePercent: z.number().min(0).max(100).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  /** Approve a self-applied PENDING rep: sets the rate + sends the Clerk invite. */
  action: z.literal('approve').optional(),
})

/** PATCH /api/partners/reps — update a rep's rate, suspend, or approve. */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { repId, ratePercent, status } = parsed.data

    // ── Approve a self-applied rep (join-link flow) ──
    if (parsed.data.action === 'approve') {
      const rep = await prisma.partnerRep.findFirst({
        where: { id: repId, orgId: ctx.org.id },
        select: { name: true, email: true, phone: true, clerkUserId: true, commissionRateBps: true },
      })
      if (!rep) return errorResponse('Rep not found', 404, 'NOT_FOUND')
      if (rep.clerkUserId) return errorResponse('Rep already has a login', 409, 'ALREADY_ACTIVE')

      const rateBps =
        ratePercent !== undefined ? Math.round(ratePercent * 100) : rep.commissionRateBps
      if (ctx.org.compensationModel === 'COMMISSION') {
        const err = validateRepRateBps(rateBps, ctx.org.commissionRateBps)
        if (err) return errorResponse(err, 400, 'RATE_INVALID')
      }
      // invitePartnerRep updates the existing (orgId,email) row + sends the invite.
      await invitePartnerRep(ctx.org.id, {
        name: rep.name,
        email: rep.email,
        phone: rep.phone,
        commissionRateBps: rateBps,
      })
      return successResponse({ success: true, invited: true })
    }

    const data: { commissionRateBps?: number; status?: 'ACTIVE' | 'SUSPENDED' } = {}
    if (ratePercent !== undefined) {
      const rateBps = Math.round(ratePercent * 100)
      if (ctx.org.compensationModel === 'COMMISSION') {
        const err = validateRepRateBps(rateBps, ctx.org.commissionRateBps)
        if (err) return errorResponse(err, 400, 'RATE_INVALID')
      }
      data.commissionRateBps = rateBps
    }
    if (status) data.status = status

    const result = await prisma.partnerRep.updateMany({
      where: { id: repId, orgId: ctx.org.id },
      data,
    })
    if (result.count === 0) return errorResponse('Rep not found', 404, 'NOT_FOUND')
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error updating rep', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update rep')
  }
}
