import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse, forbiddenResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { resolveShopClientId } from '@/lib/shop-actor'
import { recordPayment } from '@/lib/invoicing/service'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ paymentIntentId: z.string().min(1) })

/**
 * POST /api/shop/invoices/[id]/pay/confirm — after Elements confirmation,
 * verify the PaymentIntent and record it on the invoice (idempotent; the
 * webhook records the same PI if it lands first).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('paymentIntentId is required', 400, 'VALIDATION_ERROR')

    const stripe = requireStripeClient()
    const intent = await stripe.paymentIntents.retrieve(
      parsed.data.paymentIntentId,
      undefined,
      connectRequestOptions()
    )

    // Fail closed: the PI must belong to this caller's client AND this invoice.
    if (intent.metadata?.clientId !== clientId || intent.metadata?.invoiceId !== id) {
      logger.warn('[shop/invoices] pay-confirm ownership mismatch', {
        userId,
        clientId,
        piClientId: intent.metadata?.clientId ?? null,
        piInvoiceId: intent.metadata?.invoiceId ?? null,
      })
      return forbiddenResponse('This payment does not belong to your account')
    }

    if (intent.status !== 'succeeded') {
      // ACH debits stay `processing` for days — the webhook records the
      // payment when it clears. Report pending so the UI can confirm receipt.
      return successResponse({
        success: false,
        pending: intent.status === 'processing',
        stripeStatus: intent.status,
      })
    }

    const view = await recordPayment(id, {
      amount: (intent.amount_received || intent.amount) / 100,
      method: 'stripe',
      stripePaymentIntentId: intent.id,
      notes: 'Paid online via client portal',
    })
    return successResponse({
      success: true,
      status: view.invoice.status,
      amountDue: view.totals.amountDue,
    })
  } catch (error) {
    if (error instanceof StripeConfigError) {
      return errorResponse('Payments are not configured', 503, error.code)
    }
    const message = error instanceof Error ? error.message : 'Confirm failed'
    logger.error('[shop/invoices/:id/pay/confirm] error', { message }, error as Error)
    return errorResponse(message)
  }
}
