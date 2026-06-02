'use client'

import { loadStripe, type Stripe } from '@stripe/stripe-js'

/**
 * Memoized client-side Stripe.js loader. The publishable key is returned by
 * our checkout/setup-intent endpoints so we never hardcode it in the bundle.
 *
 * For Stripe Connect Direct charges, pass the connected account id so Stripe.js
 * (Elements, confirmPayment, handleNextAction) operates on that account using
 * the platform publishable key.
 */
const cache = new Map<string, Promise<Stripe | null>>()

export function getStripePromise(
  publishableKey: string,
  stripeAccount?: string
): Promise<Stripe | null> {
  const cacheKey = stripeAccount ? `${publishableKey}::${stripeAccount}` : publishableKey
  let promise = cache.get(cacheKey)
  if (!promise) {
    promise = loadStripe(publishableKey, stripeAccount ? { stripeAccount } : undefined)
    cache.set(cacheKey, promise)
  }
  return promise
}
