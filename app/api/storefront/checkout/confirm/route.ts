import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { getStripeClient } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { reconcileRetailOrderFromPaymentIntent } from '@/lib/storefront-payments'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  paymentIntentId: z.string().min(1),
})

/**
 * POST /api/storefront/checkout/confirm — public, rate-limited.
 *
 * Called by the storefront after Stripe Elements confirms the card payment so
 * the buyer sees an immediate paid/pending state. The PI is re-fetched from
 * Stripe (never trusted from the client) and reconciled idempotently; the
 * webhook remains the authoritative backstop.
 */
export async function POST(request: NextRequest) {
  try {
    const { limited, remaining, retryAfter } = await checkRateLimit(
      getRateLimitKey(request),
      RATE_LIMITS.publicCheckout
    )
    if (limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        {
          status: 429,
          headers: getRateLimitHeaders(remaining, RATE_LIMITS.publicCheckout, retryAfter),
        }
      )
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse('paymentIntentId is required', 400, 'VALIDATION_ERROR')
    }

    const stripe = getStripeClient()
    if (!stripe) return errorResponse('Payments are not configured', 503, 'STRIPE_UNCONFIGURED')

    const pi = await stripe.paymentIntents.retrieve(
      parsed.data.paymentIntentId,
      {},
      connectRequestOptions()
    )

    // Only retail PIs may be confirmed through this public endpoint.
    if (!pi.metadata?.retailOrderId) {
      return errorResponse('Not a storefront payment', 404, 'NOT_FOUND')
    }

    const result = await reconcileRetailOrderFromPaymentIntent(pi)
    if (!result.matched) {
      return errorResponse('Order not found for this payment', 404, 'NOT_FOUND')
    }

    return successResponse({
      success: result.paymentStatus === 'CAPTURED',
      pending: result.paymentStatus === 'AUTHORIZED' || result.paymentStatus === 'PENDING',
      paymentStatus: result.paymentStatus,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Confirm failed'
    logger.error('Storefront confirm error', { message }, error as Error)
    return errorResponse(message)
  }
}
