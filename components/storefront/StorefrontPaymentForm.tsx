'use client'

import { useMemo, useRef, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { Appearance } from '@stripe/stripe-js'
import { Loader2, Lock } from 'lucide-react'
import { getStripePromise } from '@/lib/stripe-client'

export interface StorefrontPaymentInfo {
  clientSecret: string
  paymentIntentId: string
  publishableKey?: string
  connectedAccountId?: string
}

interface StorefrontPaymentFormProps {
  payment: StorefrontPaymentInfo
  amountLabel: string
  /** Tenant brand primary for the pay button + Elements accents. */
  primaryColor: string
  onPaid: (opts: { pending: boolean }) => void
}

/**
 * Card payment step for the public storefront checkout. Confirms the
 * PaymentIntent with Stripe Elements (card-only, no redirects) and then asks
 * the server to reconcile the retail order.
 */
export function StorefrontPaymentForm({
  payment,
  amountLabel,
  primaryColor,
  onPaid,
}: StorefrontPaymentFormProps) {
  const stripePromise = useMemo(
    () =>
      payment.publishableKey
        ? getStripePromise(payment.publishableKey, payment.connectedAccountId)
        : null,
    [payment.publishableKey, payment.connectedAccountId]
  )

  const appearance: Appearance = useMemo(
    () => ({
      theme: 'stripe',
      variables: {
        colorPrimary: primaryColor,
        borderRadius: '10px',
      },
    }),
    [primaryColor]
  )

  if (!stripePromise) {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
        Payments are not available right now — the store will contact you to collect payment.
      </p>
    )
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret: payment.clientSecret, appearance }}>
      <InnerForm
        paymentIntentId={payment.paymentIntentId}
        amountLabel={amountLabel}
        primaryColor={primaryColor}
        onPaid={onPaid}
      />
    </Elements>
  )
}

function InnerForm({
  paymentIntentId,
  amountLabel,
  primaryColor,
  onPaid,
}: {
  paymentIntentId: string
  amountLabel: string
  primaryColor: string
  onPaid: (opts: { pending: boolean }) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous double-submit guard (state updates are async).
  const submittingRef = useRef(false)

  const handlePay = async () => {
    if (!stripe || !elements || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) throw new Error(submitError.message || 'Please check your card details')

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      })
      if (confirmError) throw new Error(confirmError.message || 'Payment failed')

      const res = await fetch('/api/storefront/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || (!data.success && !data.pending)) {
        throw new Error(data.message || 'Payment was not completed')
      }
      onPaid({ pending: !data.success && Boolean(data.pending) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handlePay}
        disabled={!stripe || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: primaryColor }}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          </>
        ) : (
          <>Pay {amountLabel}</>
        )}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <Lock className="h-3 w-3" /> Payments are processed securely by Stripe.
      </p>
    </div>
  )
}
