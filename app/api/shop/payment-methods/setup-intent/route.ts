import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { requireStripeClient, StripeConfigError, getStripePublishableKey } from '@/lib/stripe/config'
import { connectRequestOptions, getConnectedAccountId } from '@/lib/stripe/connect'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer'
import { resolveShopClientId } from '@/lib/shop-actor'

export const dynamic = 'force-dynamic'

/**
 * POST /api/shop/payment-methods/setup-intent
 * Creates a SetupIntent so the client can save a card via Stripe Elements
 * without making a purchase. No raw card data ever touches our server.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const rateLimitKey = getRateLimitKey(request, userId)
    const { limited, remaining, retryAfter } = await checkRateLimit(rateLimitKey, RATE_LIMITS.auth)
    if (limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(remaining, RATE_LIMITS.auth, retryAfter) }
      )
    }

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const stripe = requireStripeClient()
    const customer = await getOrCreateStripeCustomer(clientId)

    const setupIntent = await stripe.setupIntents.create(
      {
        customer: customer.id,
        usage: 'off_session',
        metadata: { clientId },
      },
      connectRequestOptions()
    )

    logger.info('[STRIPE] SetupIntent created', { clientId, setupIntentId: setupIntent.id })

    return successResponse({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      publishableKey: getStripePublishableKey(),
      connectedAccountId: getConnectedAccountId(),
    })
  } catch (error) {
    if (error instanceof StripeConfigError) {
      return errorResponse('Payments are not configured', 503, error.code)
    }
    const message = error instanceof Error ? error.message : 'Failed to create setup intent'
    logger.error('[STRIPE] setup-intent error', { message }, error as Error)
    return errorResponse(message)
  }
}
