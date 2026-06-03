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
import { CreditCard, Plus, Trash2, Star, Loader2, Lock } from 'lucide-react'

interface SavedMethod {
  id: string
  cardBrand: string | null
  cardLast4: string | null
  expiryMonth: number | null
  expiryYear: number | null
  isDefault: boolean
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

/**
 * Manage the client's Stripe saved cards: list, add (SetupIntent + Elements),
 * and remove. No raw card data ever touches our server.
 */
export function SavedCards() {
  const [methods, setMethods] = useState<SavedMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState<{
    clientSecret: string
    publishableKey: string
    connectedAccountId?: string
  } | null>(null)
  const [creatingSetup, setCreatingSetup] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/shop/payment-methods')
      .then((r) => (r.ok ? r.json() : { paymentMethods: [] }))
      .then((data) => setMethods(data.paymentMethods ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const startAdd = async () => {
    setError(null)
    setCreatingSetup(true)
    setAdding(true)
    try {
      const res = await fetch('/api/shop/payment-methods/setup-intent', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.clientSecret) throw new Error(data.message || 'Could not start card setup')
      setSetup({
        clientSecret: data.clientSecret,
        publishableKey: data.publishableKey,
        connectedAccountId: data.connectedAccountId,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start card setup')
      setAdding(false)
    } finally {
      setCreatingSetup(false)
    }
  }

  const remove = async (id: string) => {
    await fetch('/api/shop/payment-methods', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethodId: id }),
    })
    load()
  }

  const onCardSaved = () => {
    setAdding(false)
    setSetup(null)
    load()
  }

  const stripePromise = useMemo(
    () => (setup?.publishableKey ? getStripePromise(setup.publishableKey, setup.connectedAccountId) : null),
    [setup?.publishableKey, setup?.connectedAccountId]
  )

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-white/40">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : methods.length === 0 && !adding ? (
        <div className="text-center py-8">
          <CreditCard className="h-12 w-12 text-white/30 mx-auto mb-3" />
          <p className="text-white/60">No payment methods saved</p>
          <p className="text-sm text-white/40 mt-1">Add a card for faster checkout</p>
        </div>
      ) : (
        <div className="space-y-3">
          {methods.map((card) => (
            <div
              key={card.id}
              className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${
                card.isDefault
                  ? 'border-[#213cef]/50 bg-[#213cef]/10'
                  : 'border-white/10 hover:border-white/20 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-white/10">
                  <CreditCard className="h-6 w-6 text-white/70" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">
                      {(card.cardBrand ?? 'Card').toUpperCase()} •••• {card.cardLast4}
                    </p>
                    {card.isDefault && (
                      <span className="inline-flex items-center text-xs bg-[#213cef]/20 text-[#213cef] rounded px-1.5 py-0.5">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white/50">
                    Expires {card.expiryMonth?.toString().padStart(2, '0')}/{card.expiryYear}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/40 hover:text-red-400 hover:bg-red-500/10"
                onClick={() => remove(card.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add-card flow */}
      {adding ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
          {creatingSetup || !setup || !stripePromise ? (
            <div className="flex items-center justify-center py-8 text-white/40">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Elements stripe={stripePromise} options={{ clientSecret: setup.clientSecret, appearance }}>
              <AddCardForm onSaved={onCardSaved} onCancel={() => { setAdding(false); setSetup(null) }} onError={setError} />
            </Elements>
          )}
        </div>
      ) : (
        <Button
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
          onClick={startAdd}
        >
          <Plus className="mr-2 h-4 w-4" /> Add Card
        </Button>
      )}

      <div className="flex items-center gap-2 text-white/40 text-xs">
        <Lock className="h-3.5 w-3.5" />
        <span>Cards are stored securely by Stripe; we never see your full card number.</span>
      </div>
    </div>
  )
}

function AddCardForm({
  onSaved,
  onCancel,
  onError,
}: {
  onSaved: () => void
  onCancel: () => void
  onError: (msg: string | null) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!stripe || !elements) return
    setSaving(true)
    onError(null)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) throw new Error(submitError.message || 'Please check your card details')

      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: `${window.location.origin}/shop/account` },
      })
      if (confirmError) throw new Error(confirmError.message || 'Could not save card')

      const pmId =
        typeof setupIntent?.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent?.payment_method?.id
      if (!pmId) throw new Error('No payment method returned')

      const res = await fetch('/api/shop/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripePaymentMethodId: pmId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Could not save card')
      onSaved()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save card')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <div className="flex gap-2">
        <Button
          className="flex-1 bg-[#213cef] hover:bg-[#1a30c0] text-white rounded-xl"
          onClick={handleSave}
          disabled={!stripe || saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Card'}
        </Button>
        <Button
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10 rounded-xl"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
