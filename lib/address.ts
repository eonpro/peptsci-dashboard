/**
 * Shared postal-address type + Zod schema, used by onboarding, profile,
 * patients, and checkout. Stored as JSON on Client/Patient/Order.
 */
import { z } from 'zod'

export interface Address {
  address1: string
  address2?: string
  city: string
  state: string
  zip: string
  country?: string
}

export const addressSchema = z.object({
  address1: z.string().trim().min(1, 'Street address is required').max(200),
  address2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(2, 'State is required').max(50),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code'),
  country: z.string().trim().max(2).optional().default('US'),
})

/** Empty / whitespace contact email → omitted. Invalid non-empty values still fail. */
const optionalCheckoutEmail = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, z.string().email().max(200).optional())

/**
 * Checkout shipping payload. Street fields are optional here because ship-to-patient
 * overwrites them server-side; email must not reject the empty string the shop form
 * always sends when the practice contact email is blank.
 */
export const checkoutShippingAddressSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    email: optionalCheckoutEmail,
    phone: z.string().optional(),
    address1: z.string().optional(),
    address2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
  })
  .passthrough()

export type CheckoutShippingAddress = z.infer<typeof checkoutShippingAddressSchema>

function asAddressRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Shop checkout "ship to practice" payload. Only street fields are taken from the
 * address form so a stored empty `email` cannot overwrite the contact email and
 * trip checkout validation.
 */
export function buildPracticeCheckoutAddress(input: {
  company?: string
  email?: string
  phone?: string
  address: Partial<Address> & Record<string, unknown>
}): Record<string, unknown> {
  const email = nonEmpty(input.email)
  const phone = nonEmpty(input.phone)
  const company = nonEmpty(input.company)
  return {
    ...(company ? { company } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    address1: input.address.address1,
    ...(nonEmpty(input.address.address2) ? { address2: input.address.address2 } : {}),
    city: input.address.city,
    state: input.address.state,
    zip: input.address.zip,
    country: nonEmpty(input.address.country) ?? 'US',
  }
}

/**
 * Copy the clinic's saved shipping (else billing) address onto a manual order
 * so FedEx labels have a destination when ops creates the order without a
 * pasted ship-to.
 */
export function practiceOrderShippingAddress(client: {
  organizationName: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  shippingAddress: unknown
  billingAddress: unknown
}): Record<string, unknown> | null {
  const stored = asAddressRecord(client.shippingAddress) ?? asAddressRecord(client.billingAddress)
  if (!stored) return null
  const personName = nonEmpty(client.contactName) ?? nonEmpty(client.organizationName)
  const company = nonEmpty(client.organizationName)
  const email = nonEmpty(client.contactEmail)
  const phone = nonEmpty(client.contactPhone)
  return {
    ...stored,
    ...(company ? { company } : {}),
    ...(personName ? { name: personName, personName } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
  }
}

/** Format an address for single-line display. */
export function formatAddress(addr: Partial<Address> | null | undefined): string {
  if (!addr) return ''
  const line2 = addr.address2 ? `, ${addr.address2}` : ''
  const tail = [addr.city, addr.state].filter(Boolean).join(', ')
  return [`${addr.address1 ?? ''}${line2}`, `${tail} ${addr.zip ?? ''}`.trim()]
    .filter(Boolean)
    .join(' • ')
}
