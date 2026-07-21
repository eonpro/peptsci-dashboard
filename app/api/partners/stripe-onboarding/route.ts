import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getPartnerContext, roleAtLeast } from '@/lib/partners/auth'
import {
  createConnectOnboardingLink,
  partnerStripePayoutsEnabled,
  PartnerPayoutStripeError,
} from '@/lib/partners/stripe-payouts'

export const dynamic = 'force-dynamic'

/**
 * POST /api/partners/stripe-onboarding — mint a Stripe Express onboarding
 * link for the org so payouts can move automatically. Org OWNER/ADMIN only.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getPartnerContext()
    if (!ctx) return errorResponse('Partner access required', 403, 'FORBIDDEN')
    if (ctx.kind !== 'ORG' || !roleAtLeast(ctx.role, 'ADMIN')) {
      return errorResponse('Only org owners/admins can connect payouts', 403, 'FORBIDDEN')
    }
    if (!partnerStripePayoutsEnabled()) {
      return errorResponse('Stripe payouts are not enabled for the program yet', 409, 'FEATURE_DISABLED')
    }

    const { limited } = await checkRateLimit(getRateLimitKey(request, ctx.userId), RATE_LIMITS.standard)
    if (limited) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED')

    const url = await createConnectOnboardingLink(ctx.org.id)
    return successResponse({ url })
  } catch (error) {
    if (error instanceof PartnerPayoutStripeError) {
      return errorResponse(error.message, error.status, error.code)
    }
    logger.error('[PARTNER STRIPE] onboarding link error', {}, error as Error)
    return errorResponse('Failed to create the onboarding link')
  }
}
