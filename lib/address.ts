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

/** Format an address for single-line display. */
export function formatAddress(addr: Partial<Address> | null | undefined): string {
  if (!addr) return ''
  const line2 = addr.address2 ? `, ${addr.address2}` : ''
  const tail = [addr.city, addr.state].filter(Boolean).join(', ')
  return [`${addr.address1 ?? ''}${line2}`, `${tail} ${addr.zip ?? ''}`.trim()]
    .filter(Boolean)
    .join(' • ')
}
