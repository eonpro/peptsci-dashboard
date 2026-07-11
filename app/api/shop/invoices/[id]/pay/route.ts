import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type Stripe from 'stripe'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { toCents, getStripePublishableKey } from '@/lib/stripe'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import { connectRequestOptions, getConnectedAccountId, applicationFeeAmount } from '@/lib/stripe/connect'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer'
import { resolveShopClientId } from '@/lib/shop-actor'
import { getInvoice, recordPayment } from '@/lib/invoicing/service'
import { formatInvoiceNumber } from '@/lib/invoicing/core'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  savedPaymentMethodId: z.string().optional(),
})

const PAYABLE_STATUSES = new Set(['OPEN', 'PARTIAL', 'OVERDUE'])

/**
 * POST /api/shop/invoices/[id]/pay — pay the invoice's current amount due by
 * card. Saved card → charged off-session immediately; otherwise returns a
 * PaymentIntent client secret for Stripe Elements. The PI carries
 * metadata.invoiceId (no orderId) so the webhook and the confirm endpoint
 * record it as an InvoicePayment rather than an order/external sale.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const rl = checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.auth)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.auth, rl.retryAfter) }
      )
    }
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const view = await getInvoice(id)
    if (!view || view.invoice.clientId !== clientId || view.invoice.status === 'DRAFT') {
      return errorResponse('Invoice not found', 404, 'NOT_FOUND')
    }
    if (!PAYABLE_STATUSES.has(view.invoice.status) || view.totals.amountDue <= 0) {
      return errorResponse('This invoice has no balance due', 409, 'NOTHING_DUE')
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('Invalid request body', 400, 'VALIDATION_ERROR')
    const { savedPaymentMethodId } = parsed.data

    const stripe = requireStripeClient()
    const customer = await getOrCreateStripeCustomer(clientId)

    const amount = toCents(view.totals.amountDue)
    const appFee = applicationFeeAmount(amount)
    const invoiceLabel = formatInvoiceNumber(view.invoice.invoiceNumber)
    const baseParams: Stripe.PaymentIntentCreateParams = {
      amount,
      currency: 'usd',
      customer: customer.id,
      description: `PeptSci invoice ${invoiceLabel}`,
      metadata: { invoiceId: view.invoice.id, clientId },
      ...(appFee ? { application_fee_amount: appFee } : {}),
    }

    // ── Saved-card path: charge off-session immediately ──
    if (savedPaymentMethodId) {
      const saved = await prisma.paymentMethod.findFirst({
        where: { id: savedPaymentMethodId, clientId, isActive: true },
      })
      if (!saved) return errorResponse('Saved payment method not found', 404, 'PM_NOT_FOUND')

      let intent: Stripe.PaymentIntent
      try {
        intent = await stripe.paymentIntents.create(
          {
            ...baseParams,
            payment_method: saved.stripePaymentMethodId,
            confirm: true,
            off_session: true,
          },
          // Amount-aware idempotency: a retry after a partial payment (new
          // amount due) must create a fresh PI, not replay the old amount.
          connectRequestOptions({ idempotencyKey: `pi_inv_${view.invoice.id}_${amount}` })
        )
      } catch (err) {
        const stripeErr = err as { message?: string }
        return NextResponse.json(
          { error: 'Payment failed', message: stripeErr.message ?? 'Payment failed', code: 'PAYMENT_FAILED' },
          { status: 402 }
        )
      }

      await prisma.paymentMethod.update({ where: { id: saved.id }, data: { lastUsedAt: new Date() } })

      if (intent.status === 'requires_action') {
        return successResponse({
          requiresAction: true,
          clientSecret: intent.client_secret,
          paymentIntentId: intent.id,
          publishableKey: getStripePublishableKey(),
          connectedAccountId: getConnectedAccountId(),
        })
      }

      if (intent.status !== 'succeeded') {
        return NextResponse.json(
          { error: 'Payment not completed', message: `Payment ${intent.status}`, code: 'PAYMENT_NOT_COMPLETED' },
          { status: 402 }
        )
      }

      const updated = await recordPayment(view.invoice.id, {
        amount: (intent.amount_received || intent.amount) / 100,
        method: 'stripe',
        stripePaymentIntentId: intent.id,
        notes: 'Paid online via client portal',
      })
      return successResponse({
        success: true,
        status: updated.invoice.status,
        amountDue: updated.totals.amountDue,
      })
    }

    // ── New-card path: unconfirmed PI; client confirms via Elements ──
    const intent = await stripe.paymentIntents.create(baseParams, connectRequestOptions())
    return successResponse({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amount,
      publishableKey: getStripePublishableKey(),
      connectedAccountId: getConnectedAccountId(),
    })
  } catch (error) {
    if (error instanceof StripeConfigError) {
      return errorResponse('Payments are not configured', 503, error.code)
    }
    const message = error instanceof Error ? error.message : 'Payment failed'
    logger.error('[shop/invoices/:id/pay] error', { message }, error as Error)
    return errorResponse(message)
  }
}
