import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { toCents, getStripePublishableKey, elementsPaymentMethodTypes } from '@/lib/stripe'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import { connectRequestOptions, getConnectedAccountId, applicationFeeAmount } from '@/lib/stripe/connect'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer'
import { reconcileOrderFromPaymentIntent, persistPaymentMethodFromStripe } from '@/lib/stripe/payments'
import { chargeOrderWithSavedCard } from '@/lib/stripe/charge-saved-card'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — saved cards on file for this order's client (for the charge UI). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, clientId: true, total: true, paymentStatus: true },
    })
    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')

    const cards = await prisma.paymentMethod.findMany({
      where: { clientId: order.clientId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }],
      select: { id: true, cardBrand: true, cardLast4: true, expiryMonth: true, expiryYear: true, isDefault: true },
    })

    return successResponse({
      paymentStatus: order.paymentStatus,
      total: Number(order.total),
      savedCards: cards,
      publishableKey: getStripePublishableKey(),
      connectedAccountId: getConnectedAccountId(),
    })
  } catch (error) {
    if (error instanceof StripeConfigError) return errorResponse('Payments are not configured', 503, error.code)
    logger.error('[ADMIN CHARGE] GET error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load payment options')
  }
}

const bodySchema = z.object({
  /** Charge an existing saved card off-session. */
  savedPaymentMethodId: z.string().optional(),
  /** Confirm/reconcile a PI after the admin completed Stripe Elements. */
  paymentIntentId: z.string().optional(),
  /** Persist the card used for future off-session reorders. */
  saveCard: z.boolean().optional(),
})

/**
 * POST /api/admin/orders/[id]/charge — take payment for a manual order from the
 * platform. Reuses the shop's Model-A flow: PIs carry metadata.orderId so
 * `reconcileOrderFromPaymentIntent` handles capture, analytics sync, and
 * inventory reservation. Three modes:
 *   - { savedPaymentMethodId }  → off-session charge, reconcile immediately
 *   - { paymentIntentId }       → reconcile after an Elements confirmation
 *   - {}                        → create an unconfirmed PI, return clientSecret
 * Admin only.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request body', 400, 'INVALID_BODY')
    const { savedPaymentMethodId, paymentIntentId, saveCard } = parsed.data

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, orderNumber: true, clientId: true, total: true, paymentStatus: true },
    })
    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')
    if (order.paymentStatus === 'CAPTURED') {
      return errorResponse('This order is already paid', 400, 'ALREADY_PAID')
    }

    const stripe = requireStripeClient()
    const customer = await getOrCreateStripeCustomer(order.clientId)

    const amount = toCents(Number(order.total))
    const appFee = applicationFeeAmount(amount)
    const baseParams: Stripe.PaymentIntentCreateParams = {
      amount,
      currency: 'usd',
      customer: customer.id,
      description: `PeptSci order #${order.orderNumber}`,
      metadata: { orderId: order.id, clientId: order.clientId },
      ...(saveCard || savedPaymentMethodId ? { setup_future_usage: 'off_session' as const } : {}),
      ...(appFee ? { application_fee_amount: appFee } : {}),
    }

    // ── Confirm-after-Elements: reconcile an already-confirmed PI ──
    if (paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, undefined, connectRequestOptions())
      if (intent.metadata?.orderId !== order.id) {
        return forbiddenResponse('This payment does not belong to the order')
      }
      const result = await reconcileOrderFromPaymentIntent(intent)
      const pmId = typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id
      if (saveCard && pmId && result.paymentStatus === 'CAPTURED') {
        try {
          const saved = await persistPaymentMethodFromStripe({ clientId: order.clientId, stripePaymentMethodId: pmId })
          await prisma.order.update({ where: { id: order.id }, data: { paymentMethodId: saved.id } })
        } catch (e) {
          logger.warn('[ADMIN CHARGE] persist card failed (non-blocking)', { error: e instanceof Error ? e.message : String(e) })
        }
      }
      return successResponse({
        success: result.paymentStatus === 'CAPTURED',
        orderId: order.id,
        paymentStatus: result.paymentStatus,
        stripeStatus: intent.status,
      })
    }

    // ── Saved-card path: charge off-session immediately ──
    if (savedPaymentMethodId) {
      const charged = await chargeOrderWithSavedCard({
        orderId: order.id,
        paymentMethodId: savedPaymentMethodId,
        idempotencyKey: `pi_admin_saved_${order.id}`,
        metadata: { source: 'admin_charge' },
      })
      if (charged.status === 'no_card' || charged.status === 'not_found') {
        return errorResponse('Saved payment method not found', 404, 'PM_NOT_FOUND')
      }
      if (charged.status === 'stripe_unconfigured') {
        return errorResponse('Payments are not configured', 503, 'STRIPE_UNCONFIGURED')
      }
      if (charged.status === 'already_paid') {
        return errorResponse('This order is already paid', 400, 'ALREADY_PAID')
      }
      if (charged.status === 'requires_action') {
        return successResponse({
          requiresAction: true,
          clientSecret: charged.clientSecret,
          paymentIntentId: charged.paymentIntentId,
          orderId: order.id,
          publishableKey: getStripePublishableKey(),
          connectedAccountId: getConnectedAccountId(),
        })
      }
      if (charged.status === 'failed') {
        return NextResponse.json(
          {
            error: 'Payment failed',
            message: charged.message,
            code: 'PAYMENT_FAILED',
            orderId: order.id,
          },
          { status: 402 }
        )
      }
      return successResponse({
        success: true,
        orderId: order.id,
        paymentStatus: charged.paymentStatus,
        paymentIntentId: charged.paymentIntentId,
      })
    }

    // ── New-card path: create unconfirmed PI; admin confirms via Elements ──
    const intent = await stripe.paymentIntents.create(
      { ...baseParams, payment_method_types: elementsPaymentMethodTypes() },
      connectRequestOptions({ idempotencyKey: `pi_admin_create_${order.id}` })
    )
    await prisma.order.update({ where: { id: order.id }, data: { stripePaymentIntentId: intent.id } })

    return successResponse({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      orderId: order.id,
      amount,
      publishableKey: getStripePublishableKey(),
      connectedAccountId: getConnectedAccountId(),
    })
  } catch (error) {
    if (error instanceof StripeConfigError) return errorResponse('Payments are not configured', 503, error.code)
    const message = error instanceof Error ? error.message : 'Charge failed'
    logger.error('[ADMIN CHARGE] error', { message }, error as Error)
    return errorResponse(message)
  }
}
