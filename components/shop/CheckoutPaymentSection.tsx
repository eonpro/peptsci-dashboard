'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import type { Appearance } from '@stripe/stripe-js'
import { getStripePromise } from '@/lib/stripe-client'
import { Button } from '@/components/ui/button'
import { Loader2, Lock, CreditCard, Plus, CheckCircle2 } from 'lucide-react'

interface CheckoutItem {
  sku: string
  quantity: number
}

interface SavedMethod {
  id: string
  cardBrand: string | null
  cardLast4: string | null
  expiryMonth: number | null
  expiryYear: number | null
  isDefault: boolean
}

interface ProcessResponse {
  clientSecret?: string
  paymentIntentId?: string
  orderId?: string
  orderNumber?: number
  publishableKey?: string
  connectedAccountId?: string
  // saved-card immediate result
  success?: boolean
  paymentStatus?: string
  requiresAction?: boolean
}

interface Props {
  items: CheckoutItem[]
  shippingAddress: Record<string, unknown>
  notes?: string
  total: number
  onSuccess: (orderId: string) => void
}

const appearance: Appearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#213cef',
    colorBackground: '#0a0e3a',
    colorText: '#ffffff',
    borderRadius: '12px',
  },
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export function CheckoutPaymentSection({ items, shippingAddress, notes, total, onSuccess }: Props) {
  const [savedMethods, setSavedMethods] = useState<SavedMethod[]>([])
  const [loadingMethods, setLoadingMethods] = useState(true)
  const [selected, setSelected] = useState<string>('new') // 'new' or a saved method id
  const [saveCard, setSaveCard] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)

  // New-card PaymentIntent (created lazily when the new-card option is active).
  const [pi, setPi] = useState<{
    clientSecret: string
    publishableKey: string
    orderId: string
    connectedAccountId?: string
  } | null>(null)
  const [creatingPi, setCreatingPi] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/shop/payment-methods')
      .then((r) => (r.ok ? r.json() : { paymentMethods: [] }))
      .then((data) => {
        if (!active) return
        const methods: SavedMethod[] = data.paymentMethods ?? []
        setSavedMethods(methods)
        const def = methods.find((m) => m.isDefault) ?? methods[0]
        if (def) setSelected(def.id)
      })
      .catch(() => {})
      .finally(() => active && setLoadingMethods(false))
    return () => {
      active = false
    }
  }, [])

  const createNewCardIntent = useCallback(async () => {
    setCreatingPi(true)
    setError(null)
    try {
      const res = await fetch('/api/shop/checkout/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, shippingAddress, notes, saveCard }),
      })
      const data: ProcessResponse & { message?: string } = await res.json()
      if (!res.ok || !data.clientSecret || !data.publishableKey || !data.orderId) {
        throw new Error(data.message || 'Could not start payment')
      }
      setPi({
        clientSecret: data.clientSecret,
        publishableKey: data.publishableKey,
        orderId: data.orderId,
        connectedAccountId: data.connectedAccountId,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment')
    } finally {
      setCreatingPi(false)
    }
  }, [items, shippingAddress, notes, saveCard])

  // Create the PaymentIntent when the new-card option becomes active.
  useEffect(() => {
    if (selected === 'new' && !pi && !creatingPi) {
      void createNewCardIntent()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const paySavedCard = useCallback(async () => {
    setPlacing(true)
    setError(null)
    try {
      const res = await fetch('/api/shop/checkout/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, shippingAddress, notes, savedPaymentMethodId: selected }),
      })
      const data: ProcessResponse & { message?: string } = await res.json()

      if (data.requiresAction && data.clientSecret && data.publishableKey) {
        const stripe = await getStripePromise(data.publishableKey, data.connectedAccountId)
        if (!stripe) throw new Error('Stripe failed to load')
        const { error: actionError } = await stripe.handleNextAction({ clientSecret: data.clientSecret })
        if (actionError) throw new Error(actionError.message || 'Authentication failed')
        const confirm = await fetch('/api/shop/checkout/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: data.paymentIntentId }),
        })
        const confirmData = await confirm.json()
        if (!confirm.ok || !confirmData.success) throw new Error(confirmData.message || 'Payment not completed')
        onSuccess(data.orderId || confirmData.orderId)
        return
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Payment failed')
      }
      onSuccess(data.orderId!)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setPlacing(false)
    }
  }, [items, shippingAddress, notes, selected, onSuccess])

  const stripePromise = useMemo(
    () => (pi?.publishableKey ? getStripePromise(pi.publishableKey, pi.connectedAccountId) : null),
    [pi?.publishableKey, pi?.connectedAccountId]
  )

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
          {error}
        </div>
      )}

      {/* Saved cards */}
      {!loadingMethods && savedMethods.length > 0 && (
        <div className="space-y-2">
          {savedMethods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
                selected === m.id
                  ? 'border-[#213cef] bg-[#213cef]/10'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <CreditCard className="h-5 w-5 text-white/70" />
              <span className="flex-1 text-white text-sm">
                {(m.cardBrand ?? 'Card').toUpperCase()} ···· {m.cardLast4}
                <span className="text-white/40 ml-2">
                  {m.expiryMonth?.toString().padStart(2, '0')}/{m.expiryYear}
                </span>
              </span>
              {selected === m.id && <CheckCircle2 className="h-5 w-5 text-[#213cef]" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected('new')}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
              selected === 'new'
                ? 'border-[#213cef] bg-[#213cef]/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}
          >
            <Plus className="h-5 w-5 text-white/70" />
            <span className="flex-1 text-white text-sm">Use a new card</span>
            {selected === 'new' && <CheckCircle2 className="h-5 w-5 text-[#213cef]" />}
          </button>
        </div>
      )}

      {/* Saved-card pay button */}
      {selected !== 'new' && (
        <Button
          className="w-full h-12 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold"
          onClick={paySavedCard}
          disabled={placing}
        >
          {placing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
            </>
          ) : (
            <>Pay {formatPrice(total)}</>
          )}
        </Button>
      )}

      {/* New-card Stripe Payment Element */}
      {selected === 'new' && (
        <div className="space-y-4">
          {creatingPi || !pi || !stripePromise ? (
            <div className="flex items-center justify-center py-10 text-white/50">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Elements stripe={stripePromise} options={{ clientSecret: pi.clientSecret, appearance }}>
              <NewCardForm
                orderId={pi.orderId}
                paymentIntentId={pi.clientSecret}
                total={total}
                saveCard={saveCard}
                onToggleSave={setSaveCard}
                onSuccess={onSuccess}
                onError={setError}
              />
            </Elements>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-white/40 text-xs">
        <Lock className="h-3.5 w-3.5" />
        <span>Payments are encrypted and processed securely by Stripe</span>
      </div>
    </div>
  )
}

function NewCardForm({
  orderId,
  total,
  saveCard,
  onToggleSave,
  onSuccess,
  onError,
}: {
  orderId: string
  paymentIntentId: string
  total: number
  saveCard: boolean
  onToggleSave: (v: boolean) => void
  onSuccess: (orderId: string) => void
  onError: (msg: string | null) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  const handlePay = async () => {
    if (!stripe || !elements) return
    setSubmitting(true)
    onError(null)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) throw new Error(submitError.message || 'Please check your card details')

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/shop/checkout/success`,
        },
      })
      if (confirmError) throw new Error(confirmError.message || 'Payment could not be completed')

      const confirm = await fetch('/api/shop/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent?.id, saveCard }),
      })
      const confirmData = await confirm.json()
      if (!confirm.ok || !confirmData.success) {
        throw new Error(confirmData.message || 'Payment was not completed')
      }
      onSuccess(orderId)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
        <input
          type="checkbox"
          checked={saveCard}
          onChange={(e) => onToggleSave(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/5"
        />
        Save this card for faster checkout and reorders
      </label>
      <Button
        className="w-full h-12 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold"
        onClick={handlePay}
        disabled={!stripe || submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
          </>
        ) : (
          <>Pay {formatPrice(total)}</>
        )}
      </Button>
    </div>
  )
}
