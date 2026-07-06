import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse, forbiddenResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import {
  reconcileOrderFromPaymentIntent,
  persistPaymentMethodFromStripe,
} from '@/lib/stripe/payments'
import { resolveShopClientId } from '@/lib/shop-actor'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  paymentIntentId: z.string().min(1),
  saveCard: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const rateLimitKey = getRateLimitKey(request, userId)
    const { limited, remaining, retryAfter } = checkRateLimit(rateLimitKey, RATE_LIMITS.auth)
    if (limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(remaining, RATE_LIMITS.auth, retryAfter) }
      )
    }

    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse('paymentIntentId is required', 400, 'VALIDATION_ERROR')
    }
    const { paymentIntentId, saveCard } = parsed.data

    const stripe = requireStripeClient()
    const intent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      undefined,
      connectRequestOptions()
    )

    // Ownership check: the PI must belong to this caller's client. Fail closed —
    // a PaymentIntent with no clientId in metadata is rejected rather than
    // trusted, so a caller can't confirm someone else's (or an unattributed) PI.
    if (intent.metadata?.clientId !== clientId) {
      logger.warn('[CHECKOUT] confirm ownership mismatch', {
        userId,
        clientId,
        piClientId: intent.metadata?.clientId ?? null,
      })
      return forbiddenResponse('This payment does not belong to your account')
    }

    const result = await reconcileOrderFromPaymentIntent(intent)
    if (!result.matched) {
      return errorResponse('Order for this payment was not found', 404, 'ORDER_NOT_FOUND')
    }

    // Persist the saved card and link it to the order when requested.
    const pmId = typeof intent.payment_method === 'string'
      ? intent.payment_method
      : intent.payment_method?.id
    if (saveCard && pmId && result.paymentStatus === 'CAPTURED') {
      try {
        const saved = await persistPaymentMethodFromStripe({
          clientId,
          stripePaymentMethodId: pmId,
        })
        if (result.orderId) {
          await prisma.order.update({
            where: { id: result.orderId },
            data: { paymentMethodId: saved.id },
          })
        }
      } catch (e) {
        logger.warn('[CHECKOUT] Failed to persist saved card (non-blocking)', {
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return successResponse({
      success: result.paymentStatus === 'CAPTURED',
      orderId: result.orderId,
      paymentStatus: result.paymentStatus,
      stripeStatus: intent.status,
    })
  } catch (error) {
    if (error instanceof StripeConfigError) {
      return errorResponse('Payments are not configured', 503, error.code)
    }
    const message = error instanceof Error ? error.message : 'Confirm failed'
    logger.error('[CHECKOUT] confirm error', { message }, error as Error)
    return errorResponse(message)
  }
}
