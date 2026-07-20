import { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { generateReferralCode, referralUrl } from '@/lib/partners/referral'
import { linkAnalytics } from '@/lib/partners/queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/partners/links — the caller's referral links (org: all links;
 * rep: only their own).
 */
export async function GET() {
  try {
    const ctx = await requirePartner()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const scope = { orgId: ctx.org.id, ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}) }
    const [links, analytics] = await Promise.all([
      prisma.referralLink.findMany({
        where: {
          orgId: ctx.org.id,
          ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}),
        },
        include: { rep: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      linkAnalytics(scope, 30),
    ])
    return successResponse({
      links: links.map((l) => ({
        ...l,
        url: referralUrl(l.code),
        landingUrl: referralUrl(l.code).replace('/join/', '/p/'),
      })),
      analytics,
    })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error listing links', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to list links')
  }
}

const createSchema = z.object({
  label: z.string().trim().max(120).optional().or(z.literal('')),
  /** Org sessions may create links attributed to a specific rep. */
  repId: z.string().trim().min(1).nullable().optional(),
})

/** POST /api/partners/links — create a referral link. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requirePartner({ minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = createSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')

    // Reps always create links attributed to themselves.
    let repId: string | null = ctx.kind === 'REP' ? ctx.rep!.id : (parsed.data.repId ?? null)
    if (repId && ctx.kind === 'ORG') {
      const rep = await prisma.partnerRep.findFirst({
        where: { id: repId, orgId: ctx.org.id },
        select: { id: true },
      })
      if (!rep) return errorResponse('Rep not found in your org', 400, 'REP_NOT_FOUND')
    }

    // Retry on the astronomically-unlikely code collision.
    let link = null
    for (let attempt = 0; attempt < 3 && !link; attempt++) {
      try {
        link = await prisma.referralLink.create({
          data: {
            code: generateReferralCode(),
            orgId: ctx.org.id,
            repId,
            label: parsed.data.label || null,
          },
        })
      } catch (err) {
        if (attempt === 2) throw err
      }
    }

    logger.info('[PARTNER LINKS] Link created', { orgId: ctx.org.id, linkId: link!.id })
    return successResponse({ link: { ...link!, url: referralUrl(link!.code) } }, 201)
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error creating link', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to create link')
  }
}

const patchSchema = z.object({
  linkId: z.string().trim().min(1),
  active: z.boolean().optional(),
  label: z.string().trim().max(120).nullable().optional(),
})

/** PATCH /api/partners/links — toggle/relabel a link the caller owns. */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requirePartner({ minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid request', 400, 'VALIDATION_ERROR')
    const { linkId, ...data } = parsed.data

    const result = await prisma.referralLink.updateMany({
      where: {
        id: linkId,
        orgId: ctx.org.id,
        ...(ctx.kind === 'REP' ? { repId: ctx.rep!.id } : {}),
      },
      data,
    })
    if (result.count === 0) return errorResponse('Link not found', 404, 'NOT_FOUND')
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error updating link', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to update link')
  }
}
