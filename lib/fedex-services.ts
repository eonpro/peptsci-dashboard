/**
 * FedEx service-type + packaging-type catalogs.
 *
 * Ported verbatim from the EonPro integration (logosrx.eonpro.io). Pure data,
 * no dependencies — safe to import on client or server.
 */

export type FedExServiceType = {
  code: string
  label: string
  category: 'ground' | 'express' | 'overnight'
  estimatedDays: string
  oneRateEligible: boolean
}

export const FEDEX_SERVICE_TYPES: FedExServiceType[] = [
  { code: 'FEDEX_GROUND', label: 'FedEx Ground', category: 'ground', estimatedDays: '1-5 business days', oneRateEligible: false },
  { code: 'GROUND_HOME_DELIVERY', label: 'FedEx Home Delivery', category: 'ground', estimatedDays: '1-7 business days', oneRateEligible: false },
  { code: 'FEDEX_EXPRESS_SAVER', label: 'FedEx Express Saver', category: 'express', estimatedDays: '3 business days', oneRateEligible: true },
  { code: 'FEDEX_2_DAY', label: 'FedEx 2Day', category: 'express', estimatedDays: '2 business days', oneRateEligible: true },
  { code: 'FEDEX_2_DAY_AM', label: 'FedEx 2Day A.M.', category: 'express', estimatedDays: '2 business days (AM)', oneRateEligible: true },
  { code: 'STANDARD_OVERNIGHT', label: 'FedEx Standard Overnight', category: 'overnight', estimatedDays: 'Next business day', oneRateEligible: true },
  { code: 'PRIORITY_OVERNIGHT', label: 'FedEx Priority Overnight', category: 'overnight', estimatedDays: 'Next business day (by 10:30 AM)', oneRateEligible: true },
  { code: 'FIRST_OVERNIGHT', label: 'FedEx First Overnight', category: 'overnight', estimatedDays: 'Next business day (by 8 AM)', oneRateEligible: true },
]

export type FedExPackagingType = {
  code: string
  label: string
  oneRateEligible: boolean
  oneRateMaxLbs: number | null
}

export const FEDEX_PACKAGING_TYPES: FedExPackagingType[] = [
  { code: 'YOUR_PACKAGING', label: 'Your Packaging', oneRateEligible: false, oneRateMaxLbs: null },
  { code: 'FEDEX_ENVELOPE', label: 'FedEx Envelope', oneRateEligible: true, oneRateMaxLbs: 10 },
  { code: 'FEDEX_PAK', label: 'FedEx Pak', oneRateEligible: true, oneRateMaxLbs: 50 },
  { code: 'FEDEX_BOX', label: 'FedEx Box', oneRateEligible: true, oneRateMaxLbs: 50 },
  { code: 'FEDEX_SMALL_BOX', label: 'FedEx Small Box', oneRateEligible: true, oneRateMaxLbs: 50 },
  { code: 'FEDEX_MEDIUM_BOX', label: 'FedEx Medium Box', oneRateEligible: true, oneRateMaxLbs: 50 },
  { code: 'FEDEX_LARGE_BOX', label: 'FedEx Large Box', oneRateEligible: true, oneRateMaxLbs: 50 },
  { code: 'FEDEX_EXTRA_LARGE_BOX', label: 'FedEx Extra Large Box', oneRateEligible: true, oneRateMaxLbs: 50 },
  { code: 'FEDEX_TUBE', label: 'FedEx Tube', oneRateEligible: true, oneRateMaxLbs: 50 },
]

export type FedExPackagingCode = (typeof FEDEX_PACKAGING_TYPES)[number]['code']

export function isValidServiceType(code: string): boolean {
  return FEDEX_SERVICE_TYPES.some((s) => s.code === code)
}

export function isValidPackagingType(code: string): boolean {
  return FEDEX_PACKAGING_TYPES.some((p) => p.code === code)
}
