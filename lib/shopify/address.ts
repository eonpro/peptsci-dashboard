/**
 * Map Shopify shipping address → PeptSci Order.shippingAddress JSON shape.
 */

import type { PlatformShippingAddress } from '@/lib/stripe/resolve-address'

export type ShopifyAddressLike = {
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  province_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
  phone?: string | null
}

function trimSafe(s: unknown): string {
  return typeof s === 'string' ? s.trim() : ''
}

export function fromShopifyShippingAddress(
  addr: ShopifyAddressLike | null | undefined,
  fallbackPhone?: string | null
): PlatformShippingAddress | null {
  if (!addr) return null
  const address1 = trimSafe(addr.address1)
  const city = trimSafe(addr.city)
  const zip = trimSafe(addr.zip)
  if (!address1 && !city && !zip) return null

  const nameFromParts = [trimSafe(addr.first_name), trimSafe(addr.last_name)].filter(Boolean).join(' ')
  const name = trimSafe(addr.name) || nameFromParts || undefined
  const phone = trimSafe(addr.phone) || trimSafe(fallbackPhone) || undefined
  const company = trimSafe(addr.company) || undefined
  const address2 = trimSafe(addr.address2) || undefined

  return {
    address1,
    ...(address2 ? { address2 } : {}),
    city,
    state: trimSafe(addr.province_code) || trimSafe(addr.province),
    zip,
    country: trimSafe(addr.country_code) || trimSafe(addr.country) || 'US',
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(company ? { company } : {}),
  }
}
