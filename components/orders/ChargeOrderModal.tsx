'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { Appearance } from '@stripe/stripe-js'
import { getStripePromise } from '@/lib/stripe-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, CreditCard, Plus, CheckCircle2, Lock, AlertCircle } from 'lucide-react'

const ACCENT = '#2b2c84'

type SavedCard = {
  id: string
  cardBrand: string | null
  cardLast4: string | null
  expiryMonth: number | null
  expiryYear: number | null
  isDefault: boolean
}

export type ChargeOrderModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  orderNumber?: number
  onPaid?: () => void
}

const appearance: Appearance = { theme: 'stripe', variables: { colorPrimary: ACCENT, borderRadius: '8px' } }

function formatPrice(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

export default function ChargeOrderModal({ open, onOpenChange, orderId, orderNumber, onPaid }: ChargeOrderModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [alreadyPaid, setAlreadyPaid] = useState(false)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [selected, setSelected] = useState<string>('new')
  const [saveCard, setSaveCard] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [done, setDone] = useState(false)

  const [pi, setPi] = useState<{ clientSecret: string; publishableKey: string; connectedAccountId?: string } | null>(null)
  const [creatingPi, setCreatingPi] = useState(false)
  const requestedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setDone(false)
    setPi(null)
    requestedRef.current = false
    fetch(`/api/admin/orders/${orderId}/charge`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load payment options')
        return data
      })
      .then((data) => {
        setTotal(data.total ?? 0)
        setAlreadyPaid(data.paymentStatus === 'CAPTURED')
        const cards: SavedCard[] = data.savedCards ?? []
        setSavedCards(cards)
        const def = cards.find((c) => c.isDefault) ?? cards[0]
        setSelected(def ? def.id : 'new')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load payment options'))
      .finally(() => setLoading(false))
  }, [open, orderId])

  const createNewCardIntent = useCallback(async () => {
    requestedRef.current = true
    setCreatingPi(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveCard }),
      })
      const data = await res.json()
      if (!res.ok || !data.clientSecret || !data.publishableKey) throw new Error(data.message || 'Could not start payment')
      setPi({ clientSecret: data.clientSecret, publishableKey: data.publishableKey, connectedAccountId: data.connectedAccountId })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment')
    } finally {
      setCreatingPi(false)
    }
  }, [orderId, saveCard])

  useEffect(() => {
    if (!open || loading || alreadyPaid) return
    if (selected === 'new' && !pi && !creatingPi && !requestedRef.current) {
      void createNewCardIntent()
    }
  }, [open, loading, alreadyPaid, selected, pi, creatingPi, createNewCardIntent])

  const paySavedCard = useCallback(async () => {
    setPlacing(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/charge`, {
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
        const confirm = await fetch(`/api/admin/orders/${orderId}/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: data.paymentIntentId }),
        })
        const cData = await confirm.json()
        if (!confirm.ok || !cData.success) throw new Error(cData.message || 'Payment not completed')
        setDone(true)
        onPaid?.()
        return
      }
      if (!res.ok || !data.success) throw new Error(data.message || 'Payment failed')
      setDone(true)
      onPaid?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setPlacing(false)
    }
  }, [orderId, selected, onPaid])

  const stripePromise = useMemo(
    () => (pi?.publishableKey ? getStripePromise(pi.publishableKey, pi.connectedAccountId) : null),
    [pi?.publishableKey, pi?.connectedAccountId]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" style={{ color: ACCENT }} />
            Take Payment{orderNumber ? ` — Order #${orderNumber}` : ''}
          </DialogTitle>
          <DialogDescription>Charge a saved card or enter a new one. Payment is processed securely by Stripe.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : done || alreadyPaid ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="font-medium text-green-800">{alreadyPaid && !done ? 'This order is already paid.' : 'Payment captured.'}</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {savedCards.length > 0 && (
              <div className="space-y-2">
                {savedCards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      selected === c.id ? 'border-[#2b2c84] bg-[#2b2c84]/5' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <CreditCard className="h-5 w-5 text-gray-500" />
                    <span className="flex-1 text-sm text-gray-800">
                      {(c.cardBrand ?? 'Card').toUpperCase()} ···· {c.cardLast4}
                      <span className="ml-2 text-gray-400">{c.expiryMonth?.toString().padStart(2, '0')}/{c.expiryYear}</span>
                    </span>
                    {selected === c.id && <CheckCircle2 className="h-5 w-5" style={{ color: ACCENT }} />}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelected('new')}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selected === 'new' ? 'border-[#2b2c84] bg-[#2b2c84]/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Plus className="h-5 w-5 text-gray-500" />
                  <span className="flex-1 text-sm text-gray-800">Use a new card</span>
                  {selected === 'new' && <CheckCircle2 className="h-5 w-5" style={{ color: ACCENT }} />}
                </button>
              </div>
            )}

            {selected !== 'new' ? (
              <Button className="w-full" onClick={paySavedCard} disabled={placing} style={{ backgroundColor: ACCENT }}>
                {placing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                Pay {formatPrice(total)}
              </Button>
            ) : creatingPi || !pi || !stripePromise ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <Elements stripe={stripePromise} options={{ clientSecret: pi.clientSecret, appearance }}>
                <NewCardForm
                  orderId={orderId}
                  total={total}
                  saveCard={saveCard}
                  onToggleSave={setSaveCard}
                  onSuccess={() => {
                    setDone(true)
                    onPaid?.()
                  }}
                  onError={setError}
                />
              </Elements>
            )}

            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <Lock className="h-3.5 w-3.5" />
              <span>Encrypted and processed securely by Stripe</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
  total: number
  saveCard: boolean
  onToggleSave: (v: boolean) => void
  onSuccess: () => void
  onError: (msg: string | null) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const handlePay = async () => {
    if (!stripe || !elements || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    onError(null)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) throw new Error(submitError.message || 'Please check the card details')

      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: `${window.location.origin}/fulfillment` },
      })
      if (confirmError) throw new Error(confirmError.message || 'Payment could not be completed')

      const confirm = await fetch(`/api/admin/orders/${orderId}/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent?.id, saveCard }),
      })
      const cData = await confirm.json()
      if (!confirm.ok || !cData.success) throw new Error(cData.message || 'Payment was not completed')
      onSuccess()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={saveCard} onChange={(e) => onToggleSave(e.target.checked)} className="h-4 w-4" />
        Save this card for future reorders
      </label>
      <Button className="w-full" onClick={handlePay} disabled={!stripe || submitting} style={{ backgroundColor: ACCENT }}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
        Pay {formatPrice(total)}
      </Button>
    </div>
  )
}
