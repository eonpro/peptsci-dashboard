/**
 * Apply Stripe-derived addresses onto an Order + Client after convert / refresh.
 * Pure decision helpers + one prisma write path used by stripe-convert and
 * refresh-stripe-address.
 */
import type { Prisma } from '@prisma/client'
import {
  isCompleteStripeAddr,
  isIncompletePlatformAddress,
  preferredShipAddress,
  resolveStripeAddresses,
  toPlatformShippingAddress,
  type PlatformShippingAddress,
  type StripeAddrParts,
} from './resolve-address'
import type Stripe from 'stripe'

export type AddressApplyResult = {
  orderShipping: PlatformShippingAddress | null
  clientShipping: PlatformShippingAddress | null
  clientBilling: PlatformShippingAddress | null
}

/**
 * Decide what to write onto Order / Client from resolved Stripe addresses and
 * optional recipient identity. Client fields are only filled when currently
 * incomplete (never overwrite a good profile address).
 */
export function planAddressApply(input: {
  resolved: { shipping: StripeAddrParts | null; billing: StripeAddrParts | null }
  recipient?: { name?: string; phone?: string; company?: string }
  existingClientShipping?: unknown
  existingClientBilling?: unknown
  /** When true, always replace Order.shippingAddress if we have a complete ship addr. */
  forceOrderShipping?: boolean
  existingOrderShipping?: unknown
}): AddressApplyResult {
  const ship = preferredShipAddress(input.resolved)
  const bill = input.resolved.billing || input.resolved.shipping

  const orderShipping =
    isCompleteStripeAddr(ship) &&
    (input.forceOrderShipping || isIncompletePlatformAddress(input.existingOrderShipping))
      ? toPlatformShippingAddress(ship!, input.recipient)
      : null

  const clientShipping =
    isCompleteStripeAddr(ship) && isIncompletePlatformAddress(input.existingClientShipping)
      ? toPlatformShippingAddress(ship!)
      : null

  const clientBilling =
    isCompleteStripeAddr(bill) && isIncompletePlatformAddress(input.existingClientBilling)
      ? toPlatformShippingAddress(bill!)
      : null

  return { orderShipping, clientShipping, clientBilling }
}

/** Build platform shipping from flat SalesRecord columns (convert path). */
export function platformAddressFromSalesRecord(rec: {
  address: string
  address2?: string | null
  city: string
  state: string
  zip: string
  customerName?: string
  customerPhone?: string
}): PlatformShippingAddress | null {
  const address1 = (rec.address || '').trim()
  const city = (rec.city || '').trim()
  const state = (rec.state || '').trim()
  const zip = (rec.zip || '').trim()
  if (!address1 || !city || !state || !zip) return null
  const out: PlatformShippingAddress = {
    address1,
    city,
    state,
    zip,
    country: 'US',
  }
  const a2 = (rec.address2 || '').trim()
  if (a2) out.address2 = a2
  const name = (rec.customerName || '').trim()
  if (name) out.name = name
  const phone = (rec.customerPhone || '').trim()
  if (phone) out.phone = phone
  return out
}

export function resolveFromStripeGraph(input: {
  pi: Stripe.PaymentIntent
  charge: Stripe.Charge | null
  customer: Stripe.Customer | null
  invoice: Stripe.Invoice | null
}) {
  return resolveStripeAddresses(input)
}

export type ClientAddressUpdate = {
  shippingAddress?: Prisma.InputJsonValue
  billingAddress?: Prisma.InputJsonValue
}
