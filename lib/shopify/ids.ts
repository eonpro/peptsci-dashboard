/**
 * Normalize Shopify shop domains and GraphQL IDs.
 */

/** Strip protocol/path; ensure `*.myshopify.com` host form when possible. */
export function normalizeShopDomain(input: string): string {
  let s = input.trim().toLowerCase()
  s = s.replace(/^https?:\/\//, '')
  s = s.split('/')[0] ?? s
  s = s.replace(/:\d+$/, '')
  if (s && !s.includes('.') && !s.endsWith('.myshopify.com')) {
    s = `${s}.myshopify.com`
  }
  return s
}

/** Extract numeric id from a Shopify GID or pass through numeric strings. */
export function shopifyGidToNumeric(gidOrId: string | number | null | undefined): string | null {
  if (gidOrId == null) return null
  const s = String(gidOrId).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return s
  const m = s.match(/\/(\d+)\s*$/)
  return m ? m[1] : s
}

export function toProductVariantGid(id: string): string {
  if (id.startsWith('gid://')) return id
  return `gid://shopify/ProductVariant/${id}`
}

export function toOrderGid(id: string): string {
  if (id.startsWith('gid://')) return id
  return `gid://shopify/Order/${id}`
}

export function toFulfillmentOrderGid(id: string): string {
  if (id.startsWith('gid://')) return id
  return `gid://shopify/FulfillmentOrder/${id}`
}
