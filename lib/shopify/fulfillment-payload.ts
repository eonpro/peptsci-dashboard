/**
 * Build GraphQL variables / carrier mapping for Shopify fulfillment sync.
 * Pure helpers for unit tests.
 */

export type TrackingPushInput = {
  carrier: string | null | undefined
  trackingNumber: string
  trackingUrl: string | null | undefined
}

/** Map PeptSci carrier labels to Shopify tracking company names. */
export function shopifyTrackingCompany(carrier: string | null | undefined): string {
  const c = (carrier ?? '').trim().toLowerCase()
  if (!c) return 'Other'
  if (c.includes('fedex')) return 'FedEx'
  if (c.includes('ups')) return 'UPS'
  if (c.includes('usps') || c.includes('postal')) return 'USPS'
  if (c.includes('dhl')) return 'DHL'
  if (c.includes('hand')) return 'Other'
  return carrier!.trim()
}

export function buildFulfillmentTrackingPayload(input: TrackingPushInput): {
  company: string
  number: string
  url: string | undefined
} {
  return {
    company: shopifyTrackingCompany(input.carrier),
    number: input.trackingNumber.trim(),
    url: input.trackingUrl?.trim() || undefined,
  }
}
