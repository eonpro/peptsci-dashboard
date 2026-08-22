/**
 * Pure helpers for clinic checkout drafts: cart identity and which abandoned
 * drafts a new attempt should supersede (shipping-speed / credit toggles).
 */

export function checkoutCartFingerprint(
  lines: Array<{ variantId: string; quantity: number; unitPrice: number }>
): string {
  return lines
    .map((l) => `${l.variantId}:${l.quantity}:${Number(l.unitPrice)}`)
    .sort()
    .join('|')
}

export function selectSupersededDraftIds(
  drafts: Array<{
    id: string
    items: Array<{ variantId: string; quantity: number; unitPrice: number }>
  }>,
  fingerprint: string,
  keepOrderId?: string | null
): string[] {
  return drafts
    .filter((d) => d.id !== keepOrderId)
    .filter((d) => checkoutCartFingerprint(d.items) === fingerprint)
    .map((d) => d.id)
}

/** Written on abandoned drafts so a late Stripe webhook cannot resurrect them. */
export const SUPERSEDED_CHECKOUT_REASON = 'Superseded by an updated checkout'

export function isSupersededCheckoutDraft(
  paymentStatus: string,
  failureReason: string | null | undefined
): boolean {
  return paymentStatus === 'FAILED' && (failureReason ?? '').startsWith('Superseded')
}

/** Stripe client secrets are `{paymentIntentId}_secret_{random}`. */
export function paymentIntentIdFromClientSecret(clientSecret: string): string | null {
  const marker = '_secret_'
  const i = clientSecret.indexOf(marker)
  if (i <= 0) return null
  const id = clientSecret.slice(0, i)
  return id.startsWith('pi_') ? id : null
}
