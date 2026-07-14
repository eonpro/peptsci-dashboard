'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import type { Appearance } from '@stripe/stripe-js'
import { getStripePromise } from '@/lib/stripe-client'
import { Button } from '@/components/ui/button'
import { Loader2, Lock, CreditCard, Plus, CheckCircle2, FileText } from 'lucide-react'

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
  /** Server-computed charge amount in cents — the authoritative total. */
  amount?: number
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
  shipTo: 'PRACTICE' | 'PATIENT'
  shipSpeed: 'TWO_DAY' | 'OVERNIGHT'
  patientId?: string | null
  onSuccess: (orderId: string, opts?: { pending?: boolean }) => void
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

interface BillingSummary {
  openBalance: number
  hasOverdue?: boolean
  paymentTermsDays: number | null
  creditLimit: number | null
}

export function CheckoutPaymentSection({
  items,
  shippingAddress,
  notes,
  total,
  shipTo,
  shipSpeed,
  patientId,
  onSuccess,
}: Props) {
  const [savedMethods, setSavedMethods] = useState<SavedMethod[]>([])
  const [loadingMethods, setLoadingMethods] = useState(true)
  const [selected, setSelected] = useState<string>('new') // 'new', 'terms', or a saved method id
  const [saveCard, setSaveCard] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const [billing, setBilling] = useState<BillingSummary | null>(null)

  // New-card PaymentIntent (created lazily when the new-card option is active).
  const [pi, setPi] = useState<{
    clientSecret: string
    publishableKey: string
    orderId: string
    connectedAccountId?: string
    signature: string
    /** Server-computed amount in cents (what Stripe will actually charge). */
    amount?: number
  } | null>(null)
  const [creatingPi, setCreatingPi] = useState(false)
  // Signature of everything that affects the server-side PaymentIntent amount
  // and setup_future_usage. When it changes after an intent exists, the intent
  // is stale and must be recreated so Stripe charges the displayed total.
  const checkoutSignature = useMemo(
    () =>
      JSON.stringify({
        items,
        shippingAddress,
        notes: notes ?? null,
        saveCard,
        shipTo,
        shipSpeed,
        patientId: patientId ?? null,
      }),
    [items, shippingAddress, notes, saveCard, shipTo, shipSpeed, patientId]
  )
  // Last signature we attempted a creation for — prevents retry loops when a
  // creation fails and guards against redundant recreations.
  const requestedSignatureRef = useRef<string | null>(null)

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

  // Net-terms eligibility (display only — the server re-validates on submit).
  useEffect(() => {
    let active = true
    fetch('/api/shop/invoices')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.summary) setBilling(data.summary)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const termsDays = billing?.paymentTermsDays ?? 0
  const availableCredit =
    billing?.creditLimit != null ? Math.max(0, billing.creditLimit - billing.openBalance) : null
  const termsEligible =
    termsDays > 0 &&
    !billing?.hasOverdue &&
    (availableCredit == null || total <= availableCredit)

  const placeTermsOrder = useCallback(async () => {
    setPlacing(true)
    setError(null)
    try {
      const res = await fetch('/api/shop/checkout/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, shippingAddress, notes, shipTo, shipSpeed, patientId }),
      })
      const data: { success?: boolean; orderId?: string; message?: string } = await res.json()
      if (!res.ok || !data.success || !data.orderId) {
        throw new Error(data.message || 'Could not place the order on your account')
      }
      onSuccess(data.orderId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place the order')
    } finally {
      setPlacing(false)
    }
  }, [items, shippingAddress, notes, shipTo, shipSpeed, patientId, onSuccess])

  const createNewCardIntent = useCallback(async () => {
    requestedSignatureRef.current = checkoutSignature
    setCreatingPi(true)
    setError(null)
    // Drop any stale intent immediately so the pay button can't submit an
    // amount that no longer matches the cart/shipping selection.
    setPi(null)
    try {
      const res = await fetch('/api/shop/checkout/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, shippingAddress, notes, saveCard, shipTo, shipSpeed, patientId }),
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
        signature: checkoutSignature,
        amount: data.amount,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment')
    } finally {
      setCreatingPi(false)
    }
  }, [items, shippingAddress, notes, saveCard, shipTo, shipSpeed, patientId, checkoutSignature])

  // Create the PaymentIntent when the new-card option becomes active, and
  // recreate it whenever the cart, shipping, save-card choice, or ship-to
  // details change after an intent exists (otherwise Stripe would charge the
  // stale amount). The signature check prevents redundant recreations/loops.
  useEffect(() => {
    if (selected !== 'new' || creatingPi) return
    const stale = pi
      ? pi.signature !== checkoutSignature
      : requestedSignatureRef.current !== checkoutSignature
    if (stale) {
      void createNewCardIntent()
    }
  }, [selected, checkoutSignature, pi, creatingPi, createNewCardIntent])

  const paySavedCard = useCallback(async () => {
    setPlacing(true)
    setError(null)
    try {
      const res = await fetch('/api/shop/checkout/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          shippingAddress,
          notes,
          savedPaymentMethodId: selected,
          shipTo,
          shipSpeed,
          patientId,
        }),
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
        if (!confirm.ok || (!confirmData.success && !confirmData.pending)) {
          throw new Error(confirmData.message || 'Payment not completed')
        }
        onSuccess(data.orderId || confirmData.orderId, {
          pending: !confirmData.success && Boolean(confirmData.pending),
        })
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
  }, [items, shippingAddress, notes, selected, onSuccess, shipTo, shipSpeed, patientId])

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

      {/* Credit-hold notice: terms account with a past-due invoice */}
      {termsDays > 0 && billing?.hasOverdue && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm p-3">
          Billing to account is paused while an invoice is past due.{' '}
          <a href="/shop/invoices" className="underline hover:text-amber-200">
            Pay your open invoice
          </a>{' '}
          to restore terms, or pay this order by card.
        </div>
      )}

      {/* Bill to account (net terms) — admin-granted accounts only */}
      {termsEligible && (
        <button
          type="button"
          onClick={() => setSelected('terms')}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
            selected === 'terms'
              ? 'border-brand-primary bg-brand-primary/10'
              : 'border-white/10 bg-white/5 hover:bg-white/10'
          }`}
        >
          <FileText className="h-5 w-5 text-white/70" />
          <span className="flex-1">
            <span className="block text-white text-sm font-medium">
              Bill to account — Net {termsDays}
            </span>
            <span className="block text-white/50 text-xs">
              No card needed. We&rsquo;ll invoice your practice
              {availableCredit != null ? ` (${formatPrice(availableCredit)} credit available)` : ''}.
            </span>
          </span>
          {selected === 'terms' && <CheckCircle2 className="h-5 w-5 text-brand-primary" />}
        </button>
      )}

      {/* Card option toggle (only needed when terms is offered and there are no
          saved cards — otherwise the saved-cards block already provides it) */}
      {termsEligible && !loadingMethods && savedMethods.length === 0 && (
        <button
          type="button"
          onClick={() => setSelected('new')}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
            selected === 'new'
              ? 'border-brand-primary bg-brand-primary/10'
              : 'border-white/10 bg-white/5 hover:bg-white/10'
          }`}
        >
          <CreditCard className="h-5 w-5 text-white/70" />
          <span className="flex-1 text-white text-sm">Pay by card</span>
          {selected === 'new' && <CheckCircle2 className="h-5 w-5 text-brand-primary" />}
        </button>
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
            className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
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

      {/* Bill-to-account place-order button */}
      {selected === 'terms' && (
        <Button
          className="w-full h-12 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold"
          onClick={placeTermsOrder}
          disabled={placing}
        >
          {placing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Placing order…
            </>
          ) : (
            <>Place Order — {formatPrice(total)} on Net {termsDays}</>
          )}
        </Button>
      )}

      {/* Saved-card pay button */}
      {selected !== 'new' && selected !== 'terms' && (
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
                // The SERVER's amount is what Stripe charges — display that,
                // not the locally computed total (which can go stale when
                // per-client pricing changed since items were carted).
                total={pi.amount != null ? pi.amount / 100 : total}
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
  onSuccess: (orderId: string, opts?: { pending?: boolean }) => void
  onError: (msg: string | null) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  // Synchronous guard: React state updates are async, so a fast double-click
  // could otherwise call confirmPayment twice before the re-render disables
  // the button.
  const submittingRef = useRef(false)

  const handlePay = async () => {
    if (!stripe || !elements || submittingRef.current) return
    submittingRef.current = true
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
      // `pending` = ACH bank debit accepted but still settling — the order is
      // placed; payment captures via webhook when the debit clears. Surfaced
      // as a distinct "processing" state, never a false "paid" confirmation.
      if (!confirm.ok || (!confirmData.success && !confirmData.pending)) {
        throw new Error(confirmData.message || 'Payment was not completed')
      }
      onSuccess(orderId, { pending: !confirmData.success && Boolean(confirmData.pending) })
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
