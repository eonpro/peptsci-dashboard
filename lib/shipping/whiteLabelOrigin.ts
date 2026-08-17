/**
 * Resolve FedEx ship-from (origin) for white-label Shopify fulfillment.
 *
 * Shopify / white-label orders print the practice brand as the sender name.
 * Street address prefers the practice shipping address when complete; otherwise
 * packages still leave PeptSci's Tampa warehouse on the PeptSci FedEx account.
 */

export type ShipFromAddress = {
  personName: string
  companyName?: string
  phoneNumber: string
  address1: string
  address2?: string | null
  city: string
  state: string
  zip: string
}

export type WhiteLabelOriginClient = {
  organizationName?: string | null
  contactPhone?: string | null
  shippingAddress?: Record<string, unknown> | null
  /** When set, treat as white-label even if order source is not SHOPIFY. */
  whiteLabelEnabled?: boolean | null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** PeptSci Tampa defaults (mirrors FEDEX_ORIGIN_* / FedExLabelModal DEFAULT_ORIGIN). */
export function getPeptSciOrigin(): ShipFromAddress {
  return {
    personName: process.env.FEDEX_ORIGIN_NAME || 'PeptSci',
    companyName: process.env.FEDEX_ORIGIN_COMPANY || '',
    phoneNumber: process.env.FEDEX_ORIGIN_PHONE || '8138862800',
    address1: process.env.FEDEX_ORIGIN_ADDRESS1 || '401 Jackson St',
    address2: process.env.FEDEX_ORIGIN_ADDRESS2 || 'Suite 2340-K23',
    city: process.env.FEDEX_ORIGIN_CITY || 'Tampa',
    state: process.env.FEDEX_ORIGIN_STATE || 'FL',
    zip: process.env.FEDEX_ORIGIN_ZIP || '33602',
  }
}

function parseStoredAddress(a: Record<string, unknown> | null | undefined): {
  address1: string
  address2: string
  city: string
  state: string
  zip: string
  phone: string
} {
  const addr = a || {}
  return {
    address1: str(addr.address1) || str(addr.line1) || str(addr.street),
    address2: str(addr.address2) || str(addr.line2),
    city: str(addr.city),
    state: (str(addr.state) || str(addr.stateOrProvinceCode)).toUpperCase(),
    zip: str(addr.zip) || str(addr.postalCode),
    phone: str(addr.phone) || str(addr.phoneNumber),
  }
}

export function isCompleteShipFromAddress(addr: {
  address1?: string
  city?: string
  state?: string
  zip?: string
}): boolean {
  return Boolean(addr.address1 && addr.city && addr.state && addr.zip)
}

/** True when origin still matches PeptSci defaults (name + street + zip). */
export function looksLikePeptSciOrigin(origin: {
  personName?: string
  address1?: string
  zip?: string
}): boolean {
  const pept = getPeptSciOrigin()
  return (
    str(origin.personName).toLowerCase() === pept.personName.toLowerCase() &&
    str(origin.address1).toLowerCase() === pept.address1.toLowerCase() &&
    str(origin.zip) === pept.zip
  )
}

/**
 * Resolve ship-from for a fulfillment order.
 * - SHOPIFY or whiteLabelEnabled + org name → practice brand as sender
 * - Street: practice shippingAddress when complete, else PeptSci Tampa
 */
export function resolveWhiteLabelOrigin(input: {
  source?: string | null
  client?: WhiteLabelOriginClient | null
}): ShipFromAddress {
  const pept = getPeptSciOrigin()
  const orgRaw = str(input.client?.organizationName)
  const useBrand =
    Boolean(orgRaw) &&
    (input.source === 'SHOPIFY' || Boolean(input.client?.whiteLabelEnabled))

  if (!useBrand || !input.client) return pept

  const org = fedexShipFromDisplayName(orgRaw)
  const parsed = parseStoredAddress(input.client.shippingAddress ?? null)
  const addrComplete = isCompleteShipFromAddress(parsed)

  return {
    personName: org,
    companyName: org,
    phoneNumber:
      str(input.client.contactPhone) ||
      (addrComplete ? parsed.phone : '') ||
      pept.phoneNumber,
    address1: addrComplete ? parsed.address1 : pept.address1,
    address2: addrComplete ? parsed.address2 || null : pept.address2 || null,
    city: addrComplete ? parsed.city : pept.city,
    state: addrComplete ? parsed.state : pept.state,
    zip: addrComplete ? parsed.zip : pept.zip,
  }
}

/**
 * FedEx ship-from display name for a practice.
 * Drops a trailing "Peptides" so "Elevated Vitality Peptides" → "Elevated Vitality".
 */
export function fedexShipFromDisplayName(organizationName: string): string {
  const cleaned = organizationName.replace(/\s+Peptides\s*$/i, '').trim()
  return cleaned || organizationName.trim()
}
