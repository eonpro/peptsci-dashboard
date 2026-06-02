import { NextRequest } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import {
  connectRequestOptions,
  getConnectedAccountId,
  applicationFeeAmount,
} from '@/lib/stripe/connect'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    // Tiny amount in cents (default $1.00). Capped — this PI is never confirmed,
    // so no money moves, but we keep it small as a safety belt.
    amountCents: z.number().int().min(50).max(500).optional(),
  })
  .optional()

/**
 * POST /api/stripe/test-intent  (admin only)
 *
 * Validates the full Stripe Connect path WITHOUT a real charge: creates an
 * unconfirmed PaymentIntent ON the connected account (platform key +
 * `stripeAccount` header), then immediately cancels it. Proves that the
 * platform key, the connected-account routing, and the optional application
 * fee all work end-to-end. No payment method is attached, so nothing is
 * charged. Never returns secret values.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse()

    const parsed = bodySchema.safeParse(await request.json().catch(() => undefined))
    const amount = (parsed.success && parsed.data?.amountCents) || 100

    const stripe = requireStripeClient()
    const connectedAccountId = getConnectedAccountId()
    const appFee = applicationFeeAmount(amount)

    const start = Date.now()
    let intent: Stripe.PaymentIntent
    try {
      intent = await stripe.paymentIntents.create(
        {
          amount,
          currency: 'usd',
          description: 'PeptSci Connect smoke test (auto-canceled)',
          metadata: { source: 'connect_test' },
          ...(appFee ? { application_fee_amount: appFee } : {}),
        },
        connectRequestOptions()
      )
    } catch (err) {
      const e = err as { message?: string; type?: string; code?: string }
      logger.warn('[STRIPE] test-intent create failed', {
        connectedAccountId,
        type: e.type,
        code: e.code,
        message: e.message,
      })
      return errorResponse(
        `Connected-account PaymentIntent failed: ${e.message ?? 'unknown error'}`,
        502,
        'CONNECT_TEST_FAILED'
      )
    }
    const latencyMs = Date.now() - start

    // Clean up immediately — no charge, don't leave an incomplete PI lying around.
    let canceled = false
    try {
      const c = await stripe.paymentIntents.cancel(intent.id, undefined, connectRequestOptions())
      canceled = c.status === 'canceled'
    } catch (e) {
      logger.warn('[STRIPE] test-intent cancel failed (PI still harmless)', {
        paymentIntentId: intent.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }

    logger.info('[STRIPE] Connect smoke test ok', {
      connectedAccountId,
      paymentIntentId: intent.id,
      latencyMs,
      canceled,
    })

    return successResponse({
      success: true,
      message: connectedAccountId
        ? `Created a test PaymentIntent on connected account ${connectedAccountId} and canceled it.`
        : 'Created a test PaymentIntent on the platform account (no connected account configured) and canceled it.',
      connectEnabled: !!connectedAccountId,
      connectedAccountId,
      paymentIntentId: intent.id,
      amount,
      currency: 'usd',
      applicationFeeAmount: appFee ?? 0,
      statusOnCreate: intent.status,
      canceled,
      livemode: intent.livemode,
      latencyMs,
    })
  } catch (error) {
    if (error instanceof StripeConfigError) {
      return errorResponse('Payments are not configured', 503, error.code)
    }
    const message = error instanceof Error ? error.message : 'Test intent failed'
    logger.error('[STRIPE] test-intent error', { message }, error as Error)
    return errorResponse(message)
  }
}
