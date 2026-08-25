/**
 * Stripe PaymentIntent flags for shop/admin charges.
 *
 * Stripe rejects confirming with `off_session=true` when `setup_future_usage`
 * is also set — saving a method can require on-session 3DS. Saved-card charges
 * therefore confirm off-session without setup_future_usage (the card is already
 * on file). New-card intents set setup_future_usage only when the buyer asked
 * to save, and are confirmed on-session via Elements.
 */

import type Stripe from 'stripe'

type SavedCardParams = Pick<
  Stripe.PaymentIntentCreateParams,
  'confirm' | 'off_session' | 'setup_future_usage'
>

type NewCardParams = Pick<Stripe.PaymentIntentCreateParams, 'setup_future_usage' | 'off_session' | 'confirm'>

/** Charge an existing saved PaymentMethod immediately. */
export function savedCardPaymentIntentParams(): SavedCardParams {
  return { confirm: true, off_session: true }
}

/** Unconfirmed PI for Stripe Elements; optionally save the new method. */
export function newCardPaymentIntentParams(opts: { saveCard?: boolean } = {}): NewCardParams {
  return opts.saveCard ? { setup_future_usage: 'off_session' } : {}
}
