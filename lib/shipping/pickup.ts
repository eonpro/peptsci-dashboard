/**
 * PeptSci Tampa office used for local pickup at checkout.
 * Street matches FedEx origin defaults so warehouse copy stays in one place.
 */

import { getPeptSciOrigin } from './whiteLabelOrigin'

export type OfficePickupLocation = {
  name: string
  address1: string
  address2: string
  city: string
  state: string
  zip: string
}

export function getOfficePickupLocation(): OfficePickupLocation {
  const origin = getPeptSciOrigin()
  return {
    name: origin.companyName?.trim() || origin.personName || 'PeptSci',
    address1: origin.address1,
    address2: (origin.address2 ?? '').trim(),
    city: origin.city,
    state: origin.state,
    zip: origin.zip,
  }
}

/** One-line address for checkout summaries (street · city, ST ZIP). */
export function formatOfficePickupAddress(): string {
  const loc = getOfficePickupLocation()
  const street = [loc.address1, loc.address2].filter(Boolean).join(', ')
  return `${street} · ${loc.city}, ${loc.state} ${loc.zip}`
}
