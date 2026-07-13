import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import Stripe from 'stripe'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { getUserMetadata } from '@/lib/roles'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { toCents, getStripePublishableKey, elementsPaymentMethodTypes } from '@/lib/stripe'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import {
  connectRequestOptions,
  getConnectedAccountId,
  applicationFeeAmount,
} from '@/lib/stripe/connect'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer'
import { resolveCart, createDraftOrder } from '@/lib/stripe/checkout'
import { CartValidationError, MAX_SHOP_ITEM_QUANTITY } from '@/lib/checkout-core'
import { stockEnforcementEnabled } from '@/lib/stock-enforcement'
import { reconcileOrderFromPaymentIntent } from '@/lib/stripe/payments'
import { resolveShopActor } from '@/lib/shop-actor'

export const dynamic = 'force-dynamic'

const addressSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address1: z.string().optional(),
    address2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
  })
  .passthrough()

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().min(1).max(MAX_SHOP_ITEM_QUANTITY),
      })
    )
    .min(1),
  shippingAddress: addressSchema.optional(),
  notes: z.string().max(500).optional(),
  saveCard: z.boolean().optional(),
  savedPaymentMethodId: z.string().optional(),
  shipTo: z.enum(['PRACTICE', 'PATIENT']).optional(),
  shipSpeed: z.enum(['TWO_DAY', 'OVERNIGHT']).optional(),
  // nullish, not optional: the checkout page always sends the field and it is
  // null when shipping to the practice.
  patientId: z.string().nullish(),
})

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

    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    if (!actor) {
      // Surface clientId from session metadata for a clearer error in prod.
      const meta = await getUserMetadata().catch(() => null)
      logger.warn('[CHECKOUT] No client account for caller', {
        userId,
        sessionClientId: meta?.clientId,
      })
      return errorResponse('No client account is linked to your user', 403, 'NO_CLIENT')
    }

    const json = await request.json()
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const { items, shippingAddress, notes, saveCard, savedPaymentMethodId } = parsed.data
    const shipTo = parsed.data.shipTo ?? 'PRACTICE'
    const shipSpeed = parsed.data.shipSpeed ?? 'TWO_DAY'

    // Server-authoritative pricing + shipping — client-sent amounts are ignored.
    const cart = await resolveCart({
      clientId: actor.clientId,
      items,
      speed: shipSpeed,
      enforceStock: stockEnforcementEnabled(),
    })

    // Resolve the ship-to address server-side. For "ship to patient" the saved
    // patient record (owned by this client) is authoritative.
    let resolvedShippingAddress: Prisma.InputJsonValue | undefined =
      shippingAddress as Prisma.InputJsonValue | undefined
    let patientId: string | null = null
    if (shipTo === 'PATIENT') {
      if (!parsed.data.patientId) {
        return errorResponse('Select a patient to ship to', 400, 'PATIENT_REQUIRED')
      }
      const patient = await prisma.patient.findFirst({
        where: { id: parsed.data.patientId, clientId: actor.clientId, isActive: true },
      })
      if (!patient) return errorResponse('Patient not found', 404, 'PATIENT_NOT_FOUND')
      patientId = patient.id
      const addr = patient.address as Record<string, unknown> | null
      resolvedShippingAddress = {
        ...(addr ?? {}),
        firstName: patient.firstName,
        lastName: patient.lastName,
        phone: patient.phone ?? undefined,
      } as Prisma.InputJsonValue
    }

    const stripe = requireStripeClient()
    const customer = await getOrCreateStripeCustomer(actor.clientId)

    const order = await createDraftOrder({
      clientId: actor.clientId,
      createdById: actor.userId,
      cart,
      shippingAddress: resolvedShippingAddress,
      notes,
      shipTo,
      shipSpeed,
      patientId,
    })

    const amount = toCents(cart.totals.total)
    const appFee = applicationFeeAmount(amount)
    const baseParams: Stripe.PaymentIntentCreateParams = {
      amount,
      currency: 'usd',
      customer: customer.id,
      description: `PeptSci order #${order.orderNumber}`,
      metadata: { orderId: order.id, clientId: actor.clientId },
      ...(saveCard || savedPaymentMethodId ? { setup_future_usage: 'off_session' } : {}),
      // Direct charge on the connected account; optional platform fee.
      ...(appFee ? { application_fee_amount: appFee } : {}),
    }

    // ── Saved-card path: charge an existing card off-session immediately ──
    if (savedPaymentMethodId) {
      const saved = await prisma.paymentMethod.findFirst({
        where: { id: savedPaymentMethodId, clientId: actor.clientId, isActive: true },
      })
      if (!saved) {
        return errorResponse('Saved payment method not found', 404, 'PM_NOT_FOUND')
      }

      let intent: Stripe.PaymentIntent
      try {
        intent = await stripe.paymentIntents.create(
          {
            ...baseParams,
            payment_method: saved.stripePaymentMethodId,
            confirm: true,
            off_session: true,
          },
          connectRequestOptions({ idempotencyKey: `pi_saved_${order.id}` })
        )
      } catch (err) {
        const stripeErr = err as { message?: string; payment_intent?: Stripe.PaymentIntent }
        const pi = stripeErr.payment_intent
        const message = stripeErr.message ?? 'Payment failed'
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'FAILED',
            paymentFailureReason: message,
            stripePaymentIntentId: pi?.id,
          },
        })
        logger.warn('[CHECKOUT] Saved-card charge failed', {
          orderId: order.id,
          error: message,
        })
        return NextResponse.json(
          { error: 'Payment failed', message, code: 'PAYMENT_FAILED', orderId: order.id },
          { status: 402 }
        )
      }

      await prisma.paymentMethod.update({
        where: { id: saved.id },
        data: { lastUsedAt: new Date() },
      })
      await prisma.order.update({
        where: { id: order.id },
        data: { stripePaymentIntentId: intent.id, paymentMethodId: saved.id },
      })

      // 3DS / additional auth required even off-session — hand back to client.
      if (intent.status === 'requires_action') {
        return successResponse({
          requiresAction: true,
          clientSecret: intent.client_secret,
          paymentIntentId: intent.id,
          orderId: order.id,
          publishableKey: getStripePublishableKey(),
          connectedAccountId: getConnectedAccountId(),
        })
      }

      const result = await reconcileOrderFromPaymentIntent(intent)
      if (result.paymentStatus !== 'CAPTURED') {
        return NextResponse.json(
          {
            error: 'Payment not completed',
            message: `Payment ${intent.status}`,
            code: 'PAYMENT_NOT_COMPLETED',
            orderId: order.id,
          },
          { status: 402 }
        )
      }
      return successResponse({
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentStatus: result.paymentStatus,
        paymentIntentId: intent.id,
      })
    }

    // ── New-card path: create unconfirmed PI; client confirms via Elements ──
    // Payment Element offers every type on the PI (card + ACH when enabled).
    const intent = await stripe.paymentIntents.create(
      { ...baseParams, payment_method_types: elementsPaymentMethodTypes() },
      connectRequestOptions({ idempotencyKey: `pi_create_${order.id}` })
    )

    await prisma.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: intent.id },
    })

    return successResponse({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount,
      publishableKey: getStripePublishableKey(),
      connectedAccountId: getConnectedAccountId(),
    })
  } catch (error) {
    if (error instanceof CartValidationError) {
      logger.warn('[CHECKOUT] Cart rejected', { code: error.code, message: error.message })
      return errorResponse(error.message, 400, error.code)
    }
    if (error instanceof StripeConfigError) {
      return errorResponse('Payments are not configured', 503, error.code)
    }
    const message = error instanceof Error ? error.message : 'Checkout failed'
    logger.error('[CHECKOUT] process error', { message }, error as Error)
    return errorResponse(message)
  }
}
