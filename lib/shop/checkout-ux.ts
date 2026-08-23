/**
 * Clinic checkout UX helpers. Keep the happy path (ship to practice, pay)
 * to one decision: is shipping complete? Patient ship-to is opt-in.
 */

export type CheckoutShipTo = 'PRACTICE' | 'PATIENT'

export type CheckoutAddressBits = {
  address1?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}

export function isPracticeAddressComplete(addr: CheckoutAddressBits): boolean {
  return Boolean(
    addr.address1?.trim() &&
      addr.city?.trim() &&
      (addr.state?.trim().length ?? 0) >= 2 &&
      /^\d{5}(-\d{4})?$/.test(addr.zip?.trim() ?? '')
  )
}

export function checkoutCanPay(input: {
  shipTo: CheckoutShipTo
  practiceComplete: boolean
  selectedPatientId: string
}): boolean {
  if (input.shipTo === 'PATIENT') return input.selectedPatientId.trim().length > 0
  return input.practiceComplete
}

export function formatAddressOneLine(addr: CheckoutAddressBits): string {
  const street = addr.address1?.trim() ?? ''
  const cityState = [addr.city?.trim(), addr.state?.trim()].filter(Boolean).join(', ')
  const zip = addr.zip?.trim() ?? ''
  return [street, cityState, zip].filter(Boolean).join(' · ')
}

/** Expand the practice form when we have nothing trusted on file. */
export function shouldExpandPracticeForm(input: {
  prefillFailed: boolean
  practiceComplete: boolean
  editing: boolean
}): boolean {
  if (input.editing) return true
  if (input.prefillFailed) return true
  return !input.practiceComplete
}
