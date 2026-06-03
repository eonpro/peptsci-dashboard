/**
 * Pure NPI (National Provider Identifier) helpers — validation + NPPES
 * registry response normalization. No network/Prisma imports so the logic is
 * unit-testable; the HTTP proxy lives in app/api/npi/lookup.
 *
 * NPI is a 10-digit number issued by CMS. The 10th digit is a Luhn check
 * digit computed over the prefix "80840" + the first 9 digits (the 80840
 * prefix identifies the NPI within the ISO standard health-card namespace).
 */

import type { Address } from './address'

/** Strip everything but digits. */
export function cleanNpi(input: string): string {
  return (input || '').replace(/\D/g, '')
}

/**
 * Compute the Luhn check digit for a base string of digits (the check digit
 * itself is NOT part of `base`).
 */
function luhnCheckDigit(base: string): number {
  let sum = 0
  let double = true // the rightmost base digit is doubled (check digit appended after)
  for (let i = base.length - 1; i >= 0; i--) {
    let d = base.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return (10 - (sum % 10)) % 10
}

/**
 * Validate a 10-digit NPI using the CMS Luhn check-digit algorithm
 * (prefix "80840"). Accepts formatted input (spaces/dashes stripped).
 */
export function isValidNpi(input: string): boolean {
  const npi = cleanNpi(input)
  if (npi.length !== 10) return false
  if (/^(\d)\1{9}$/.test(npi)) return false // reject 0000000000 etc.
  const base = '80840' + npi.slice(0, 9)
  const expected = luhnCheckDigit(base)
  return expected === npi.charCodeAt(9) - 48
}

// ── NPPES registry response normalization ──────────────────────────────────

export type NpiType = 'individual' | 'organization'

export interface NppesAddressRaw {
  address_purpose?: string
  address_1?: string
  address_2?: string
  city?: string
  state?: string
  postal_code?: string
  country_code?: string
  telephone_number?: string
}

export interface NppesResultRaw {
  number?: number | string
  enumeration_type?: string // 'NPI-1' (individual) | 'NPI-2' (organization)
  basic?: {
    first_name?: string
    last_name?: string
    middle_name?: string
    credential?: string
    organization_name?: string
    name?: string
    status?: string
  }
  addresses?: NppesAddressRaw[]
  taxonomies?: Array<{ desc?: string; primary?: boolean; code?: string }>
}

export interface NormalizedProvider {
  npiNumber: string
  type: NpiType
  /** Best display name: org name, or "First Last, CRED" for individuals. */
  providerName: string
  firstName?: string
  lastName?: string
  organizationName?: string
  credential?: string
  primaryTaxonomy?: string
  practiceAddress?: Address
  phone?: string
}

function formatPostal(code: string | undefined): string {
  const digits = (code || '').replace(/\D/g, '')
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return digits.slice(0, 5)
}

function pickPracticeAddress(addresses: NppesAddressRaw[] | undefined): {
  address?: Address
  phone?: string
} {
  if (!addresses || addresses.length === 0) return {}
  const location =
    addresses.find((a) => a.address_purpose === 'LOCATION') ?? addresses[0]
  const address: Address = {
    address1: location.address_1?.trim() || '',
    address2: location.address_2?.trim() || undefined,
    city: location.city?.trim() || '',
    state: location.state?.trim() || '',
    zip: formatPostal(location.postal_code),
    country: location.country_code?.trim() || 'US',
  }
  const phone = location.telephone_number?.trim() || undefined
  return { address: address.address1 ? address : undefined, phone }
}

/** Normalize a single NPPES result into our provider shape. */
export function normalizeNppesResult(raw: NppesResultRaw): NormalizedProvider {
  const type: NpiType = raw.enumeration_type === 'NPI-2' ? 'organization' : 'individual'
  const basic = raw.basic ?? {}
  const firstName = basic.first_name?.trim() || undefined
  const lastName = basic.last_name?.trim() || undefined
  const organizationName =
    basic.organization_name?.trim() || basic.name?.trim() || undefined
  const credential = basic.credential?.trim() || undefined

  let providerName: string
  if (type === 'organization') {
    providerName = organizationName || ''
  } else {
    const full = [firstName, lastName].filter(Boolean).join(' ')
    providerName = credential ? `${full}, ${credential}` : full
  }

  const primaryTaxonomy =
    raw.taxonomies?.find((t) => t.primary)?.desc ?? raw.taxonomies?.[0]?.desc
  const { address, phone } = pickPracticeAddress(raw.addresses)

  return {
    npiNumber: String(raw.number ?? '').replace(/\D/g, ''),
    type,
    providerName: providerName.trim(),
    firstName,
    lastName,
    organizationName,
    credential,
    primaryTaxonomy: primaryTaxonomy?.trim(),
    practiceAddress: address,
    phone,
  }
}

/** Normalize a full NPPES API response (the `results` array). */
export function normalizeNppesResponse(json: unknown): NormalizedProvider[] {
  const results = (json as { results?: NppesResultRaw[] } | null)?.results
  if (!Array.isArray(results)) return []
  return results.map(normalizeNppesResult).filter((p) => p.npiNumber.length === 10)
}
