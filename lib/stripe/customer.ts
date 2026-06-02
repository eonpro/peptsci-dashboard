/**
 * Stripe Customer management for B2B clients (adapted from EonPro's
 * StripeCustomerService). One Stripe Customer per `Client`; saved cards are
 * shared across that client's users.
 */

import type Stripe from 'stripe'
import { requireStripeClient } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

function addressFromJson(value: unknown): Stripe.AddressParam | undefined {
  if (!value || typeof value !== 'object') return undefined
  const a = value as Record<string, unknown>
  const line1 = (a.address1 ?? a.line1) as string | undefined
  if (!line1) return undefined
  return {
    line1,
    line2: ((a.address2 ?? a.line2) as string | undefined) || undefined,
    city: (a.city as string | undefined) || undefined,
    state: (a.state as string | undefined) || undefined,
    postal_code: ((a.zip ?? a.postal_code) as string | undefined) || undefined,
    country: (a.country as string | undefined) || 'US',
  }
}

/**
 * Get or create the Stripe Customer for a client. Persists the id on the
 * Client row. Recreates the customer if Stripe reports it deleted/missing.
 */
export async function getOrCreateStripeCustomer(clientId: string): Promise<Stripe.Customer> {
  if (!prisma) throw new Error('Database not connected')
  const stripe = requireStripeClient()

  const client = await prisma.client.findUnique({ where: { id: clientId } })
  if (!client) throw new Error(`Client ${clientId} not found`)

  if (client.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(
        client.stripeCustomerId,
        undefined,
        connectRequestOptions()
      )
      if (!(existing as Stripe.DeletedCustomer).deleted) {
        return existing as Stripe.Customer
      }
      logger.warn('[STRIPE] Customer was deleted in Stripe; recreating', {
        clientId,
        stripeCustomerId: client.stripeCustomerId,
      })
    } catch (error) {
      logger.warn('[STRIPE] Failed to retrieve customer; recreating', {
        clientId,
        stripeCustomerId: client.stripeCustomerId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return createCustomer(client)
}

async function createCustomer(client: {
  id: string
  organizationName: string
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  billingAddress: unknown
  shippingAddress: unknown
}): Promise<Stripe.Customer> {
  if (!prisma) throw new Error('Database not connected')
  const stripe = requireStripeClient()

  const customer = await stripe.customers.create(
    {
      name: client.contactName || client.organizationName,
      email: client.contactEmail || undefined,
      phone: client.contactPhone || undefined,
      address: addressFromJson(client.billingAddress) || addressFromJson(client.shippingAddress),
      metadata: {
        clientId: client.id,
        organizationName: client.organizationName,
        source: 'peptsci_dashboard',
      },
    },
    connectRequestOptions()
  )

  await prisma.client.update({
    where: { id: client.id },
    data: { stripeCustomerId: customer.id },
  })

  logger.info('[STRIPE] Created customer for client', {
    clientId: client.id,
    stripeCustomerId: customer.id,
  })

  return customer
}
