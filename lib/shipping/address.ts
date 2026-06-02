/**
 * Shared shipping-address shapes + mappers between PeptSci's stored JSON
 * addresses (Order.shippingAddress, Client.shippingAddress, Patient.address)
 * and the FedExAddress shape required by lib/fedex.ts.
 *
 * Pure + dependency-light (only zod) so it is unit-testable and importable
 * from both server routes and client components.
 */

import { z } from 'zod'
import type { FedExAddress } from '../fedex'

/**
 * A loose address as stored in the DB. Field names vary by source (checkout
 * uses address1/zip; some legacy rows may use line1/postalCode), so the mapper
 * accepts several aliases.
 */
export type StoredAddress = {
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  personName?: string | null
  company?: string | null
  companyName?: string | null
  email?: string | null
  phone?: string | null
  phoneNumber?: string | null
  address1?: string | null
  address2?: string | null
  line1?: string | null
  line2?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  stateOrProvinceCode?: string | null
  zip?: string | null
  postalCode?: string | null
  country?: string | null
  countryCode?: string | null
  residential?: boolean | null
}

function firstNonEmpty(...vals: (string | null | undefined)[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return ''
}

/**
 * Map a stored/loose address to a FedExAddress. `fallbackName`/`fallbackPhone`
 * fill in when the address itself lacks a recipient name/phone (e.g. use the
 * client contact). Returns the mapped address plus a list of missing required
 * fields so callers can validate before calling FedEx.
 */
export function toFedExAddress(
  addr: StoredAddress | null | undefined,
  opts: { fallbackName?: string; fallbackPhone?: string; fallbackCompany?: string; residential?: boolean } = {}
): { address: FedExAddress; missing: string[] } {
  const a = addr || {}

  const composedName = firstNonEmpty(
    a.personName,
    a.name,
    [a.firstName, a.lastName].filter(Boolean).join(' ').trim() || null,
    opts.fallbackName
  )

  const address: FedExAddress = {
    personName: composedName,
    companyName: firstNonEmpty(a.companyName, a.company, opts.fallbackCompany) || undefined,
    phoneNumber: firstNonEmpty(a.phoneNumber, a.phone, opts.fallbackPhone),
    address1: firstNonEmpty(a.address1, a.line1, a.street),
    address2: firstNonEmpty(a.address2, a.line2) || undefined,
    city: firstNonEmpty(a.city),
    state: firstNonEmpty(a.state, a.stateOrProvinceCode).toUpperCase(),
    zip: firstNonEmpty(a.zip, a.postalCode),
    countryCode: firstNonEmpty(a.countryCode, a.country) || 'US',
    residential: opts.residential ?? (typeof a.residential === 'boolean' ? a.residential : true),
  }

  const missing: string[] = []
  if (!address.personName) missing.push('personName')
  if (!address.phoneNumber) missing.push('phoneNumber')
  if (!address.address1) missing.push('address1')
  if (!address.city) missing.push('city')
  if (!address.state) missing.push('state')
  if (!address.zip) missing.push('zip')

  return { address, missing }
}

/**
 * Zod schema for a FedEx address coming from an API request body. Used by the
 * label/rate routes to validate client-supplied origin/destination overrides.
 */
export const fedexAddressSchema = z.object({
  personName: z.string().min(1),
  companyName: z.string().optional(),
  phoneNumber: z.string().min(1),
  address1: z.string().min(1),
  address2: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.string().min(1).max(2),
  zip: z.string().min(1),
  countryCode: z.string().optional(),
  residential: z.boolean().optional(),
})

export type FedexAddressInput = z.infer<typeof fedexAddressSchema>
