'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { Appearance } from '@stripe/stripe-js'
import { getStripePromise } from '@/lib/stripe-client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Lock, CreditCard, Plus, CheckCircle2 } from 'lucide-react'

interface SavedMethod {
  id: string
  cardBrand: string | null
  cardLast4: string | null
  expiryMonth: number | null
  expiryYear: number | null
  isDefault: boolean
}

interface Props {
  invoiceId: string
  invoiceNumber: string
  amountDue: number
  open: boolean
  onClose: () => void
  onPaid: () => void
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

const formatPrice = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export function InvoicePayDialog({ invoiceId, invoiceNumber, amountDue, open, onClose, onPaid }: Props) {
  const [savedMethods, setSavedMethods] = useState<SavedMethod[]>([])
  const [loadingMethods, setLoadingMethods] = useState(true)
  const [selected, setSelected] = useState<string>('new')
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [pi, setPi] = useState<{
    clientSecret: string
    paymentIntentId: string
    publishableKey: string
    connectedAccountId?: string
  } | null>(null)
  const [creatingPi, setCreatingPi] = useState(false)

  useEffect(() => {
    if (!open) return
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
  }, [open])

  const createNewCardIntent = useCallback(async () => {
    setCreatingPi(true)
    setError(null)
    try {
      const res = await fetch(`/api/shop/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok || !data.clientSecret || !data.publishableKey) {
        throw new Error(data.message || 'Could not start payment')
      }
      setPi({
        clientSecret: data.clientSecret,
        paymentIntentId: data.paymentIntentId,
        publishableKey: data.publishableKey,
        connectedAccountId: data.connectedAccountId,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment')
    } finally {
      setCreatingPi(false)
    }
  }, [invoiceId])

  useEffect(() => {
    if (open && selected === 'new' && !pi && !creatingPi) void createNewCardIntent()
  }, [open, selected, pi, creatingPi, createNewCardIntent])

  const paySaved = useCallback(async () => {
    setPaying(true)
    setError(null)
    try {
      const res = await fetch(`/api/shop/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savedPaymentMethodId: selected }),
      })
      const data = await res.json()

      if (data.requiresAction && data.clientSecret && data.publishableKey) {
        const stripe = await getStripePromise(data.publishableKey, data.connectedAccountId)
        if (!stripe) throw new Error('Stripe failed to load')
        const { error: actionError } = await stripe.handleNextAction({ clientSecret: data.clientSecret })
        if (actionError) throw new Error(actionError.message || 'Authentication failed')
        const confirm = await fetch(`/api/shop/invoices/${invoiceId}/pay/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: data.paymentIntentId }),
        })
        const confirmData = await confirm.json()
        if (!confirm.ok || !confirmData.success) {
          throw new Error(confirmData.message || 'Payment not completed')
        }
        onPaid()
        return
      }

      if (!res.ok || !data.success) throw new Error(data.message || 'Payment failed')
      onPaid()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setPaying(false)
    }
  }, [invoiceId, selected, onPaid])

  const stripePromise = useMemo(
    () => (pi?.publishableKey ? getStripePromise(pi.publishableKey, pi.connectedAccountId) : null),
    [pi?.publishableKey, pi?.connectedAccountId]
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">
            Pay invoice {invoiceNumber} — {formatPrice(amountDue)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3">
              {error}
            </div>
          )}

          {!loadingMethods && savedMethods.length > 0 && (
            <div className="space-y-2">
              {savedMethods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    selected === m.id
                      ? 'border-brand-primary bg-brand-primary/10'
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
                  {selected === m.id && <CheckCircle2 className="h-5 w-5 text-brand-primary" />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelected('new')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                  selected === 'new'
                    ? 'border-brand-primary bg-brand-primary/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <Plus className="h-5 w-5 text-white/70" />
                <span className="flex-1 text-white text-sm">Use a new card</span>
                {selected === 'new' && <CheckCircle2 className="h-5 w-5 text-brand-primary" />}
              </button>
            </div>
          )}

          {selected !== 'new' && (
            <Button
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold"
              onClick={paySaved}
              disabled={paying}
            >
              {paying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…
                </>
              ) : (
                <>Pay {formatPrice(amountDue)}</>
              )}
            </Button>
          )}

          {selected === 'new' &&
            (creatingPi || !pi || !stripePromise ? (
              <div className="flex items-center justify-center py-10 text-white/50">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <Elements stripe={stripePromise} options={{ clientSecret: pi.clientSecret, appearance }}>
                <NewCardPayForm
                  invoiceId={invoiceId}
                  amountDue={amountDue}
                  onPaid={onPaid}
                  onError={setError}
                />
              </Elements>
            ))}

          <div className="flex items-center justify-center gap-2 text-white/40 text-xs">
            <Lock className="h-3.5 w-3.5" />
            <span>Payments are encrypted and processed securely by Stripe</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NewCardPayForm({
  invoiceId,
  amountDue,
  onPaid,
  onError,
}: {
  invoiceId: string
  amountDue: number
  onPaid: () => void
  onError: (msg: string | null) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  const handlePay = async () => {
    if (!stripe || !elements || submitting) return
    setSubmitting(true)
    onError(null)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) throw new Error(submitError.message || 'Please check your card details')

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: `${window.location.origin}/shop/invoices` },
      })
      if (confirmError) throw new Error(confirmError.message || 'Payment could not be completed')

      const confirm = await fetch(`/api/shop/invoices/${invoiceId}/pay/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent?.id }),
      })
      const confirmData = await confirm.json()
      if (!confirm.ok || !confirmData.success) {
        throw new Error(confirmData.message || 'Payment was not completed')
      }
      onPaid()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
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
          <>Pay {formatPrice(amountDue)}</>
        )}
      </Button>
    </div>
  )
}
