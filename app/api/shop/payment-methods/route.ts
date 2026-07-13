import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { persistPaymentMethodFromStripe } from '@/lib/stripe/payments'
import { resolveShopClientId } from '@/lib/shop-actor'

export const dynamic = 'force-dynamic'

async function authClient(request: NextRequest) {
  const { userId, isAuthenticated } = await requireAuth()
  if (!isAuthenticated || !userId) return { error: unauthorizedResponse() }

  const rl = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
  if (rl.limited) {
    return {
      error: NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.standard, rl.retryAfter) }
      ),
    }
  }

  const clientId = await resolveShopClientId(userId)
  if (!clientId) return { error: errorResponse('No client account linked', 403, 'NO_CLIENT') }
  return { clientId }
}

/** GET — list the client's active saved cards. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authClient(request)
    if ('error' in auth) return auth.error
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const methods = await prisma.paymentMethod.findMany({
      where: { clientId: auth.clientId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        cardBrand: true,
        cardLast4: true,
        expiryMonth: true,
        expiryYear: true,
        cardholderName: true,
        isDefault: true,
        lastUsedAt: true,
        createdAt: true,
      },
    })
    return successResponse({ paymentMethods: methods })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list payment methods'
    logger.error('[STRIPE] list payment methods error', { message }, error as Error)
    return errorResponse(message)
  }
}

const saveSchema = z.object({ stripePaymentMethodId: z.string().min(1), makeDefault: z.boolean().optional() })

/** POST — persist a card after a SetupIntent has been confirmed client-side. */
export async function POST(request: NextRequest) {
  try {
    const auth = await authClient(request)
    if ('error' in auth) return auth.error

    const parsed = saveSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('stripePaymentMethodId is required', 400, 'VALIDATION_ERROR')

    const stripe = requireStripeClient()
    // Verify the PM is attached to THIS client's customer before saving.
    const pm = await stripe.paymentMethods.retrieve(
      parsed.data.stripePaymentMethodId,
      undefined,
      connectRequestOptions()
    )
    const customerId = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')
    const client = await prisma.client.findUnique({ where: { id: auth.clientId }, select: { stripeCustomerId: true } })
    if (!customerId || customerId !== client?.stripeCustomerId) {
      return errorResponse('Payment method does not belong to your account', 403, 'PM_FORBIDDEN')
    }

    const saved = await persistPaymentMethodFromStripe({
      clientId: auth.clientId,
      stripePaymentMethodId: parsed.data.stripePaymentMethodId,
      makeDefault: parsed.data.makeDefault,
    })
    return successResponse({ success: true, paymentMethodId: saved.id }, 201)
  } catch (error) {
    if (error instanceof StripeConfigError) return errorResponse('Payments are not configured', 503, error.code)
    const message = error instanceof Error ? error.message : 'Failed to save payment method'
    logger.error('[STRIPE] save payment method error', { message }, error as Error)
    return errorResponse(message)
  }
}

const deleteSchema = z.object({ paymentMethodId: z.string().min(1) })

/** DELETE — detach a saved card from Stripe and deactivate it locally. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authClient(request)
    if ('error' in auth) return auth.error
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const parsed = deleteSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('paymentMethodId is required', 400, 'VALIDATION_ERROR')

    const method = await prisma.paymentMethod.findFirst({
      where: { id: parsed.data.paymentMethodId, clientId: auth.clientId },
    })
    if (!method) return errorResponse('Payment method not found', 404, 'PM_NOT_FOUND')

    const stripe = requireStripeClient()
    try {
      await stripe.paymentMethods.detach(
        method.stripePaymentMethodId,
        undefined,
        connectRequestOptions()
      )
    } catch (e) {
      // Already detached / missing in Stripe — proceed to deactivate locally.
      logger.warn('[STRIPE] detach failed (continuing)', {
        paymentMethodId: method.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }

    await prisma.paymentMethod.update({
      where: { id: method.id },
      data: { isActive: false, isDefault: false },
    })
    return successResponse({ success: true })
  } catch (error) {
    if (error instanceof StripeConfigError) return errorResponse('Payments are not configured', 503, error.code)
    const message = error instanceof Error ? error.message : 'Failed to delete payment method'
    logger.error('[STRIPE] delete payment method error', { message }, error as Error)
    return errorResponse(message)
  }
}
