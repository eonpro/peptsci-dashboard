/**
 * Stripe entrypoint. Re-exports the config module and provides small helpers.
 *
 * Prefer `getStripeClient()` / `requireStripeClient()` for new code.
 */

export {
  getStripeClient,
  requireStripeClient,
  validateStripeConfig,
  isStripeConfigured,
  isStripeTestMode,
  getStripeDiagnostics,
  getStripePublishableKey,
  getStripeWebhookSecret,
  StripeConfigError,
  STRIPE_API_VERSION,
  type StripeConfig,
} from '@/lib/stripe/config'

import { getStripeClient } from '@/lib/stripe/config'

/** Stripe currency/payment constants for the PeptSci account. */
export const STRIPE_CONFIG = {
  currency: 'usd' as const,
  // Shipping rule (Model A): free over $500, else flat $25. Tax: none.
  freeShippingThreshold: 500,
  flatShippingRate: 25,
} as const

/**
 * Legacy-style accessor that throws when Stripe is not configured.
 * Prefer `requireStripeClient()` directly in new code.
 */
export function getStripe() {
  const client = getStripeClient()
  if (!client) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.')
  }
  return client
}

/** Format a cent amount as USD currency. */
export function formatCurrency(amountInCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountInCents / 100)
}

/** Convert a dollar amount to integer cents (Stripe's smallest unit). */
export function toCents(amountInDollars: number): number {
  return Math.round(amountInDollars * 100)
}

/**
 * Payment method types offered on Stripe Elements PaymentIntents.
 * ACH (us_bank_account) is opt-in via ACH_ENABLED=true — it requires the
 * `us_bank_account_ach_payments` capability on the connected account. ACH
 * settles asynchronously: the PI stays `processing` for days, so orders remain
 * AUTHORIZED (unshippable) until the webhook's `succeeded` flips them CAPTURED.
 */
export function elementsPaymentMethodTypes(): string[] {
  return process.env.ACH_ENABLED === 'true' ? ['card', 'us_bank_account'] : ['card']
}
