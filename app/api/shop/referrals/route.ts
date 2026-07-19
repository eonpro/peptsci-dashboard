import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import {
  getOrCreateReferralCode,
  clinicReferralUrl,
  creditBalanceCents,
  CLINIC_REFERRAL_RATE_BPS,
} from '@/lib/referrals/credit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shop/referrals — the clinic's referral link, credit balance,
 * referred clinics, and credit history. Generates the referral code on first
 * visit (approved practices only).
 */
export async function GET() {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    if (!actor) return errorResponse('No client account is linked to your user', 403, 'NO_CLIENT')

    // The link only attributes for approved practices — don't hand out codes early.
    const code = actor.clientApproved ? await getOrCreateReferralCode(actor.clientId) : null

    const [balanceCents, referred, entries] = await Promise.all([
      creditBalanceCents(actor.clientId),
      prisma.client.findMany({
        where: { referredByClientId: actor.clientId },
        select: { id: true, organizationName: true, onboardingStatus: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.clientCreditEntry.findMany({
        where: { clientId: actor.clientId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          amountCents: true,
          kind: true,
          note: true,
          createdAt: true,
          sourceClient: { select: { organizationName: true } },
        },
      }),
    ])

    // Lifetime earned per referred clinic (net of reversals).
    const earnedRows = await prisma.clientCreditEntry.groupBy({
      by: ['sourceClientId'],
      where: {
        clientId: actor.clientId,
        kind: { in: ['EARNED', 'REVERSED'] },
        sourceClientId: { in: referred.map((r) => r.id) },
      },
      _sum: { amountCents: true },
    })
    const earnedByClient = new Map(earnedRows.map((r) => [r.sourceClientId, r._sum.amountCents ?? 0]))

    return successResponse({
      code,
      url: code ? clinicReferralUrl(code) : null,
      approved: actor.clientApproved,
      rateBps: CLINIC_REFERRAL_RATE_BPS,
      balanceCents,
      referrals: referred.map((r) => ({
        id: r.id,
        organizationName: r.organizationName,
        status: r.onboardingStatus,
        joinedAt: r.createdAt,
        earnedCents: earnedByClient.get(r.id) ?? 0,
      })),
      entries,
    })
  } catch (error) {
    logger.error(
      'Error loading referrals',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load referrals')
  }
}
