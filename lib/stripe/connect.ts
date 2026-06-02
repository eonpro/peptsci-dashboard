/**
 * Stripe Connect routing.
 *
 * PeptSci operates as a Stripe Connect *platform*. Live funds settle in a
 * connected account (e.g. "Como RX LLX" = acct_1S34ayDhHXlGkLX4). We therefore
 * create Customers, PaymentIntents, SetupIntents, and PaymentMethods **on the
 * connected account** using Direct charges — i.e. the platform secret key plus
 * the `stripeAccount` request header.
 *
 * Configure with STRIPE_CONNECTED_ACCOUNT_ID. When unset, all calls fall back
 * to the platform account (useful for local/dev with a standalone test key).
 */

import type Stripe from 'stripe'

export function getConnectedAccountId(): string | undefined {
  const v = process.env.STRIPE_CONNECTED_ACCOUNT_ID
  return v && v.trim().length > 0 ? v.trim() : undefined
}

export function isConnectEnabled(): boolean {
  return !!getConnectedAccountId()
}

/**
 * Optional platform fee (basis points) applied to Direct charges. When set and
 * a connected account is configured, callers add `application_fee_amount`.
 * Default unset = no platform fee (100% settles to the connected account).
 */
export function getApplicationFeeBps(): number {
  const raw = process.env.STRIPE_APPLICATION_FEE_BPS
  if (!raw) return 0
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Compute the platform fee (in cents) for a given charge amount in cents. */
export function applicationFeeAmount(amountCents: number): number | undefined {
  const bps = getApplicationFeeBps()
  if (!bps || !isConnectEnabled()) return undefined
  const fee = Math.round((amountCents * bps) / 10_000)
  return fee > 0 ? fee : undefined
}

/**
 * Build Stripe RequestOptions for the configured connected account, optionally
 * merged with extras (e.g. idempotencyKey). Returns undefined when neither a
 * connected account nor extras are present, so platform-direct calls stay clean.
 */
export function connectRequestOptions(
  extra?: Stripe.RequestOptions
): Stripe.RequestOptions | undefined {
  const stripeAccount = getConnectedAccountId()
  if (!stripeAccount && !extra) return undefined
  return { ...(stripeAccount ? { stripeAccount } : {}), ...extra }
}
