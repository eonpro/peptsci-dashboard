import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, forbiddenResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requirePartner, PartnerForbiddenError } from '@/lib/partners/auth'
import { generateReferralCode } from '@/lib/partners/referral'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { notifyAdmins } from '@/lib/notifications/service'

export const dynamic = 'force-dynamic'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')

/**
 * GET /api/partners/team-join — the org's shareable rep-application link
 * (generated on first request). Org ADMIN+.
 */
export async function GET() {
  try {
    const ctx = await requirePartner({ orgOnly: true, minRole: 'ADMIN' })
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    let code = ctx.org.teamJoinCode
    if (!code) {
      for (let attempt = 0; attempt < 3 && !code; attempt++) {
        try {
          const updated = await prisma.partnerOrg.update({
            where: { id: ctx.org.id },
            data: { teamJoinCode: generateReferralCode() },
            select: { teamJoinCode: true },
          })
          code = updated.teamJoinCode
        } catch (err) {
          if (attempt === 2) throw err
        }
      }
    }
    return successResponse({ url: `${APP_URL}/partners/join-team/${code}` })
  } catch (error) {
    if (error instanceof PartnerForbiddenError) return forbiddenResponse('Partner access required')
    logger.error('Error getting team join link', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to get join link')
  }
}

const applySchema = z.object({
  code: z.string().trim().min(4).max(32),
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(255).toLowerCase(),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
})

/**
 * POST /api/partners/team-join — PUBLIC rep application through an org's
 * join link. Creates a PENDING rep (no Clerk invite yet); the org approves
 * from the Reps page, which sends the sign-up invitation.
 */
export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimit(getRateLimitKey(request), RATE_LIMITS.auth)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Too many attempts — wait a minute.', code: 'RATE_LIMITED' },
        { status: 429 }
      )
    }
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = applySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const { code, name, email, phone } = parsed.data

    const org = await prisma.partnerOrg.findUnique({
      where: { teamJoinCode: code.toLowerCase() },
      select: { id: true, name: true, status: true },
    })
    if (!org || org.status !== 'ACTIVE') {
      return errorResponse('This join link is no longer active.', 404, 'INVALID_JOIN_LINK')
    }

    const existing = await prisma.partnerRep.findUnique({
      where: { orgId_email: { orgId: org.id, email } },
      select: { id: true },
    })
    if (existing) {
      return errorResponse('An application or account with this email already exists for this team.', 409, 'DUPLICATE')
    }

    const rep = await prisma.partnerRep.create({
      data: {
        orgId: org.id,
        name,
        email,
        phone: phone || null,
        status: 'PENDING',
        commissionRateBps: 0, // the org sets the carve-out at approval
      },
    })

    notifyAdmins({
      category: 'CLIENT',
      priority: 'NORMAL',
      title: 'New rep application',
      message: `${name} applied to join ${org.name}'s sales team.`,
      actionUrl: `/partners-admin/${org.id}`,
      sourceType: 'partner:rep-application',
      sourceId: rep.id,
    }).catch(() => {})

    logger.info('[PARTNER TEAM JOIN] Rep applied', { orgId: org.id, repId: rep.id })
    return successResponse({ success: true, orgName: org.name }, 201)
  } catch (error) {
    logger.error('Error in team join', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to submit application')
  }
}
