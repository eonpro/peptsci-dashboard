/**
 * Charge an OPEN invoice's amount due with the client's default saved card.
 */

import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { toCents } from '@/lib/stripe'
import { requireStripeClient, StripeConfigError } from '@/lib/stripe/config'
import { connectRequestOptions, applicationFeeAmount } from '@/lib/stripe/connect'
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer'
import { getInvoice, recordPayment } from '@/lib/invoicing/service'
import { formatInvoiceNumber } from '@/lib/invoicing/core'

export type ChargeInvoiceSavedCardResult =
  | { status: 'paid'; invoiceId: string; paymentIntentId: string; invoiceStatus: string }
  | { status: 'no_card' }
  | { status: 'nothing_due' }
  | { status: 'failed'; message: string }
  | { status: 'requires_action'; paymentIntentId: string; clientSecret: string | null }
  | { status: 'not_found' }
  | { status: 'stripe_unconfigured'; message: string }

const PAYABLE = new Set(['OPEN', 'PARTIAL', 'OVERDUE'])

export async function chargeInvoiceWithSavedCard(params: {
  invoiceId: string
  paymentMethodId?: string
  metadata?: Record<string, string>
  notes?: string
}): Promise<ChargeInvoiceSavedCardResult> {
  if (!prisma) return { status: 'not_found' }

  const view = await getInvoice(params.invoiceId)
  if (!view) return { status: 'not_found' }
  if (!PAYABLE.has(view.invoice.status) || view.totals.amountDue <= 0) {
    if (view.invoice.status === 'PAID') {
      return {
        status: 'paid',
        invoiceId: view.invoice.id,
        paymentIntentId: '',
        invoiceStatus: 'PAID',
      }
    }
    return { status: 'nothing_due' }
  }

  const clientId = view.invoice.clientId
  const saved = params.paymentMethodId
    ? await prisma.paymentMethod.findFirst({
        where: { id: params.paymentMethodId, clientId, isActive: true },
      })
    : await prisma.paymentMethod.findFirst({
        where: { clientId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }],
      })

  if (!saved) return { status: 'no_card' }

  let stripe: Stripe
  try {
    stripe = requireStripeClient()
  } catch (err) {
    const message =
      err instanceof StripeConfigError ? err.message : 'Payments are not configured'
    return { status: 'stripe_unconfigured', message }
  }

  const customer = await getOrCreateStripeCustomer(clientId)
  const amount = toCents(view.totals.amountDue)
  const appFee = applicationFeeAmount(amount)
  const invoiceLabel = formatInvoiceNumber(view.invoice.invoiceNumber)

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: 'usd',
        customer: customer.id,
        description: `PeptSci invoice ${invoiceLabel}`,
        payment_method: saved.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        metadata: {
          invoiceId: view.invoice.id,
          clientId,
          ...(params.metadata ?? {}),
        },
        ...(appFee ? { application_fee_amount: appFee } : {}),
      },
      connectRequestOptions({
        idempotencyKey: `pi_inv_saved_${view.invoice.id}_${amount}`,
      })
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment failed'
    logger.warn('[charge-invoice-saved-card] failed', {
      invoiceId: view.invoice.id,
      message,
    })
    return { status: 'failed', message }
  }

  await prisma.paymentMethod.update({
    where: { id: saved.id },
    data: { lastUsedAt: new Date() },
  })

  if (intent.status === 'requires_action') {
    return {
      status: 'requires_action',
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
    }
  }

  if (intent.status !== 'succeeded') {
    return { status: 'failed', message: `Payment ${intent.status}` }
  }

  const updated = await recordPayment(view.invoice.id, {
    amount: (intent.amount_received || intent.amount) / 100,
    method: 'stripe',
    stripePaymentIntentId: intent.id,
    notes: params.notes ?? 'Charged saved card (Shopify inbound)',
  })

  return {
    status: 'paid',
    invoiceId: view.invoice.id,
    paymentIntentId: intent.id,
    invoiceStatus: updated.invoice.status,
  }
}
