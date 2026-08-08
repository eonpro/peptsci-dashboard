/**
 * Resolve shipping vs billing postal addresses from a Stripe PaymentIntent
 * graph (charge, customer, invoice). Pure helpers — unit-tested; used by
 * SalesRecord ingest and order/client address backfill.
 */
import type Stripe from 'stripe'

/** Normalized Stripe address parts (empty strings when missing). */
export type StripeAddrParts = {
  line1: string
  line2: string
  city: string
  state: string
  postal_code: string
  country: string
}

/** Platform Address JSON (+ optional recipient fields for Order.shippingAddress). */
export type PlatformShippingAddress = {
  address1: string
  address2?: string
  city: string
  state: string
  zip: string
  country: string
  name?: string
  phone?: string
  company?: string
}

function trim(s: string | null | undefined): string {
  return typeof s === 'string' ? s.trim() : ''
}

/** Map a Stripe Address object; null when it has no usable street/city/postal. */
export function fromStripeAddress(
  addr: Stripe.Address | null | undefined
): StripeAddrParts | null {
  if (!addr) return null
  const line1 = trim(addr.line1)
  const city = trim(addr.city)
  const state = trim(addr.state)
  const postal_code = trim(addr.postal_code)
  if (!line1 && !city && !postal_code) return null
  return {
    line1,
    line2: trim(addr.line2),
    city,
    state,
    postal_code,
    country: trim(addr.country) || 'US',
  }
}

function firstAddress(
  ...candidates: Array<Stripe.Address | null | undefined>
): StripeAddrParts | null {
  for (const c of candidates) {
    const parsed = fromStripeAddress(c)
    if (parsed) return parsed
  }
  return null
}

function shippingDetailsAddress(
  details: { address?: Stripe.Address | null } | null | undefined
): Stripe.Address | null | undefined {
  return details?.address
}

/**
 * Prefer ship-to over bill-to. Shipping sources (in order):
 * invoice.customer_shipping → PI.shipping → charge.shipping → customer.shipping.
 * Billing: charge.billing_details → customer.address → invoice.customer_address.
 */
export function resolveStripeAddresses(input: {
  pi: Pick<Stripe.PaymentIntent, 'shipping'>
  charge: Stripe.Charge | null
  customer: Stripe.Customer | null
  invoice: Stripe.Invoice | null
}): { shipping: StripeAddrParts | null; billing: StripeAddrParts | null } {
  const { pi, charge, customer, invoice } = input

  const shipping = firstAddress(
    shippingDetailsAddress(invoice?.customer_shipping),
    shippingDetailsAddress(pi.shipping),
    shippingDetailsAddress(charge?.shipping),
    shippingDetailsAddress(customer?.shipping)
  )

  const billing = firstAddress(
    charge?.billing_details?.address,
    customer?.address,
    invoice?.customer_address
  )

  return { shipping, billing }
}

/** Fulfillment destination: shipping if present, else billing. */
export function preferredShipAddress(
  resolved: { shipping: StripeAddrParts | null; billing: StripeAddrParts | null }
): StripeAddrParts | null {
  return resolved.shipping || resolved.billing
}

/** True when address1 + city + state + zip are all non-empty. */
export function isCompleteStripeAddr(addr: StripeAddrParts | null | undefined): boolean {
  if (!addr) return false
  return Boolean(addr.line1 && addr.city && addr.state && addr.postal_code)
}

/** Convert Stripe parts → platform Address (+ optional recipient). */
export function toPlatformShippingAddress(
  addr: StripeAddrParts,
  recipient?: { name?: string; phone?: string; company?: string }
): PlatformShippingAddress {
  const out: PlatformShippingAddress = {
    address1: addr.line1,
    city: addr.city,
    state: addr.state,
    zip: addr.postal_code,
    country: addr.country || 'US',
  }
  if (addr.line2) out.address2 = addr.line2
  if (recipient?.name) out.name = recipient.name
  if (recipient?.phone) out.phone = recipient.phone
  if (recipient?.company) out.company = recipient.company
  return out
}

/** True when Client/Order JSON address is missing core street fields. */
export function isIncompletePlatformAddress(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true
  const a = value as Record<string, unknown>
  const line1 = trim(typeof a.address1 === 'string' ? a.address1 : typeof a.line1 === 'string' ? a.line1 : '')
  const city = trim(typeof a.city === 'string' ? a.city : '')
  const state = trim(typeof a.state === 'string' ? a.state : '')
  const zip = trim(
    typeof a.zip === 'string' ? a.zip : typeof a.postalCode === 'string' ? a.postalCode : ''
  )
  return !(line1 && city && state && zip)
}

/** Flat SalesRecord columns from preferred ship address. */
export function salesRecordAddressFields(addr: StripeAddrParts | null): {
  address: string
  address2: string
  city: string
  state: string
  zip: string
} {
  if (!addr) return { address: '', address2: '', city: '', state: '', zip: '' }
  return {
    address: addr.line1,
    address2: addr.line2,
    city: addr.city,
    state: addr.state,
    zip: addr.postal_code,
  }
}
