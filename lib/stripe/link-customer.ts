/**
 * Link an existing Stripe Customer (on the Connect account) to a PeptSci Client
 * and sync its saved cards into PaymentMethod rows.
 *
 * Used when a practice already paid via Stripe Dashboard / Payment Links and
 * we later create their Client row in the dashboard.
 */

import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireStripeClient } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { persistPaymentMethodFromStripe } from '@/lib/stripe/payments'

export type LinkStripeCustomerResult = {
  clientId: string
  stripeCustomerId: string
  customerName: string | null
  customerEmail: string | null
  previousClientId: string | null
  cardsSynced: Array<{
    id: string
    stripePaymentMethodId: string
    cardBrand: string | null
    cardLast4: string | null
    isDefault: boolean
  }>
}

export class LinkStripeCustomerError extends Error {
  code: string
  status: number

  constructor(message: string, code: string, status = 400) {
    super(message)
    this.name = 'LinkStripeCustomerError'
    this.code = code
    this.status = status
  }
}

/**
 * Attach `stripeCustomerId` to `clientId`, optionally stealing it from another
 * client when `force` is true, then upsert all card PaymentMethods.
 */
export async function linkStripeCustomerToClient(params: {
  clientId: string
  stripeCustomerId: string
  /** When another Client already owns this Stripe customer, reassign. */
  force?: boolean
  clerkUserId?: string | null
}): Promise<LinkStripeCustomerResult> {
  if (!prisma) throw new LinkStripeCustomerError('Database not connected', 'DB_UNAVAILABLE', 503)

  const stripeCustomerId = params.stripeCustomerId.trim()
  if (!/^cus_[A-Za-z0-9]+$/.test(stripeCustomerId)) {
    throw new LinkStripeCustomerError('Invalid Stripe customer id', 'INVALID_CUSTOMER_ID')
  }

  const client = await prisma.client.findUnique({
    where: { id: params.clientId },
    select: {
      id: true,
      organizationName: true,
      stripeCustomerId: true,
    },
  })
  if (!client) {
    throw new LinkStripeCustomerError('Client not found', 'NOT_FOUND', 404)
  }

  const stripe = requireStripeClient()
  const opts = connectRequestOptions()

  let customer: Stripe.Customer
  try {
    const retrieved = await stripe.customers.retrieve(stripeCustomerId, undefined, opts)
    if ((retrieved as Stripe.DeletedCustomer).deleted) {
      throw new LinkStripeCustomerError('Stripe customer was deleted', 'CUSTOMER_DELETED')
    }
    customer = retrieved as Stripe.Customer
  } catch (error) {
    if (error instanceof LinkStripeCustomerError) throw error
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('[STRIPE] Failed to retrieve customer for link', {
      clientId: params.clientId,
      stripeCustomerId,
      error: message,
    })
    throw new LinkStripeCustomerError(
      'Stripe customer not found on the connected account',
      'CUSTOMER_NOT_FOUND',
      404
    )
  }

  const owner = await prisma.client.findFirst({
    where: { stripeCustomerId },
    select: { id: true, organizationName: true },
  })

  let previousClientId: string | null = null
  if (owner && owner.id !== params.clientId) {
    if (!params.force) {
      throw new LinkStripeCustomerError(
        `Stripe customer is already linked to ${owner.organizationName}`,
        'CUSTOMER_IN_USE',
        409
      )
    }
    previousClientId = owner.id
    // Detach from the previous client first so the unique constraint is free.
    await prisma.client.update({
      where: { id: owner.id },
      data: { stripeCustomerId: null },
    })
  }

  // If this client already pointed at a different Stripe customer, keep their
  // old PaymentMethod rows inactive rather than deleting history.
  if (client.stripeCustomerId && client.stripeCustomerId !== stripeCustomerId) {
    await prisma.paymentMethod.updateMany({
      where: { clientId: params.clientId, isActive: true },
      data: { isActive: false, isDefault: false },
    })
  }

  await prisma.client.update({
    where: { id: params.clientId },
    data: { stripeCustomerId },
  })

  // Stamp dashboard ownership onto the Stripe customer (non-blocking).
  try {
    await stripe.customers.update(
      stripeCustomerId,
      {
        metadata: {
          ...(customer.metadata ?? {}),
          clientId: params.clientId,
          organizationName: client.organizationName,
          source: 'peptsci_dashboard',
          linkedAt: new Date().toISOString(),
        },
      },
      opts
    )
  } catch (error) {
    logger.warn('[STRIPE] Failed to update customer metadata (non-blocking)', {
      clientId: params.clientId,
      stripeCustomerId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const listed = await stripe.paymentMethods.list(
    { customer: stripeCustomerId, type: 'card', limit: 100 },
    opts
  )

  const defaultPm =
    typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id ?? null

  const cardsSynced: LinkStripeCustomerResult['cardsSynced'] = []
  for (const pm of listed.data) {
    // Reassign clientId if this PM row already existed under another client
    // (e.g. force-move). persistPaymentMethodFromStripe does not update clientId.
    const existing = await prisma.paymentMethod.findUnique({
      where: { stripePaymentMethodId: pm.id },
      select: { id: true, clientId: true },
    })
    if (existing && existing.clientId !== params.clientId) {
      await prisma.paymentMethod.update({
        where: { id: existing.id },
        data: { clientId: params.clientId },
      })
    }

    // Persist display fields only; default is assigned in one pass below so we
    // never leave two isDefault=true rows mid-loop.
    const saved = await persistPaymentMethodFromStripe({
      clientId: params.clientId,
      stripePaymentMethodId: pm.id,
      makeDefault: false,
    })
    cardsSynced.push({
      id: saved.id,
      stripePaymentMethodId: saved.stripePaymentMethodId,
      cardBrand: saved.cardBrand,
      cardLast4: saved.cardLast4,
      isDefault: false,
    })
  }

  if (cardsSynced.length > 0) {
    const preferred =
      (defaultPm && cardsSynced.find((c) => c.stripePaymentMethodId === defaultPm)) ||
      cardsSynced[0]
    await prisma.paymentMethod.updateMany({
      where: { clientId: params.clientId, isActive: true },
      data: { isDefault: false },
    })
    await prisma.paymentMethod.update({
      where: { id: preferred.id },
      data: { isDefault: true },
    })
    for (const c of cardsSynced) {
      c.isDefault = c.id === preferred.id
    }
  }

  logger.info('[STRIPE] Linked customer to client', {
    clientId: params.clientId,
    stripeCustomerId,
    previousClientId,
    cardsSynced: cardsSynced.length,
  })

  return {
    clientId: params.clientId,
    stripeCustomerId,
    customerName: customer.name ?? null,
    customerEmail: customer.email ?? null,
    previousClientId,
    cardsSynced,
  }
}
