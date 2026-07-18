'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Clock, Loader2, ShoppingBag, Truck, CreditCard } from 'lucide-react'
import { useStorefront } from '@/components/storefront/StorefrontContext'
import {
  StorefrontPaymentForm,
  type StorefrontPaymentInfo,
} from '@/components/storefront/StorefrontPaymentForm'

type Step = 'shipping' | 'review' | 'pay' | 'confirm'

export default function CheckoutPage() {
  const { config, slug, cart, cartSubtotal, cartItemCount, clearCart, session } = useStorefront()
  const branding = config?.branding

  const [step, setStep] = useState<Step>('shipping')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payment, setPayment] = useState<StorefrontPaymentInfo | null>(null)
  const [confirmation, setConfirmation] = useState<{
    orderNumber: string
    total: number
    /** 'paid' | 'pending' (card processing) | 'unpaid' (no payment collected) */
    paymentState: 'paid' | 'pending' | 'unpaid'
  } | null>(null)

  const [email, setEmail] = useState(session?.email ?? '')
  const [shipping, setShipping] = useState({
    firstName: '',
    lastName: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  })

  // Guard against NaN (e.g. a stale cart item without a valid price) so the
  // summary never renders "$NaN".
  const safeSubtotal = Number.isFinite(cartSubtotal) ? cartSubtotal : 0
  const shippingCost = safeSubtotal > 500 ? 0 : 25
  const tax = Math.round(safeSubtotal * 0.08 * 100) / 100
  const total = Math.round((safeSubtotal + shippingCost + tax) * 100) / 100

  function isShippingValid() {
    return (
      email &&
      shipping.firstName &&
      shipping.lastName &&
      shipping.address1 &&
      shipping.city &&
      shipping.state &&
      shipping.zip
    )
  }

  async function handlePlaceOrder() {
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/storefront/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          email,
          shippingAddress: shipping,
          items: cart.items.map((i) => ({
            storefrontProductId: i.storefrontProductId,
            quantity: i.quantity,
          })),
          endCustomerToken: session?.token,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Failed to place order')
        return
      }

      // Order is locked in server-side; the cart's job is done either way.
      clearCart()
      if (data.payment?.clientSecret) {
        setConfirmation({
          orderNumber: data.orderNumber,
          total: data.total,
          paymentState: 'unpaid',
        })
        setPayment(data.payment)
        setStep('pay')
      } else {
        // Payments unavailable — order recorded, store follows up to collect.
        setConfirmation({ orderNumber: data.orderNumber, total: data.total, paymentState: 'unpaid' })
        setStep('confirm')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (cartItemCount === 0 && step !== 'confirm' && step !== 'pay') {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <ShoppingBag className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-medium mb-2">Your cart is empty</h2>
        <Link
          href="/"
          className="inline-block px-6 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: branding?.colors.primary }}
        >
          Continue Shopping
        </Link>
      </div>
    )
  }

  if (step === 'confirm' && confirmation) {
    const isPending = confirmation.paymentState === 'pending'
    const isUnpaid = confirmation.paymentState === 'unpaid'
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: `${branding?.colors.accent ?? '#10b981'}20` }}
        >
          {isPending ? (
            <Clock className="h-8 w-8" style={{ color: branding?.colors.accent ?? '#10b981' }} />
          ) : (
            <Check className="h-8 w-8" style={{ color: branding?.colors.accent ?? '#10b981' }} />
          )}
        </div>
        <h1 className="text-2xl font-bold mb-2">
          {isPending ? 'Payment Processing' : 'Order Confirmed!'}
        </h1>
        <p className="text-gray-500 mb-4">
          Order <span className="font-semibold">{confirmation.orderNumber}</span> has been placed.
          {isPending && ' Your payment is processing — we\u2019ll email you once it completes.'}
          {isUnpaid &&
            ' Payment wasn\u2019t collected online; the store will contact you to complete payment.'}
        </p>
        <p className="text-lg font-bold mb-8" style={{ color: branding?.colors.primary }}>
          Total: ${confirmation.total.toFixed(2)}
        </p>
        <div className="space-y-3">
          {session && (
            <Link
              href="/account/orders"
              className="block px-6 py-3 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: branding?.colors.primary }}
            >
              View Orders
            </Link>
          )}
          <Link
            href="/"
            className="block px-6 py-3 rounded-lg border text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm mb-6 opacity-60 hover:opacity-100 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Store
      </Link>

      <h1 className="text-2xl font-bold mb-8">Checkout</h1>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { key: 'shipping', label: 'Shipping', icon: Truck },
          { key: 'review', label: 'Review', icon: ShoppingBag },
          { key: 'pay', label: 'Pay', icon: CreditCard },
        ].map((s, i) => {
          const Icon = s.icon
          const order = ['shipping', 'review', 'pay']
          const active = step === s.key
          const completed = order.indexOf(step) > order.indexOf(s.key)
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className="w-12 h-px bg-gray-300" />}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                  active ? 'text-white' : completed ? 'text-white' : 'text-gray-400 border'
                }`}
                style={
                  active || completed
                    ? { backgroundColor: branding?.colors.primary ?? '#213cef' }
                    : {}
                }
              >
                {completed ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                {s.label}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-2">
          {step === 'shipping' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold mb-4">Shipping Information</h2>

              <div>
                <label className="text-xs font-medium text-gray-600">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-hidden focus:ring-2"
                  style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">First Name</label>
                  <input
                    type="text"
                    required
                    value={shipping.firstName}
                    onChange={(e) => setShipping((s) => ({ ...s, firstName: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-hidden focus:ring-2"
                    style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Last Name</label>
                  <input
                    type="text"
                    required
                    value={shipping.lastName}
                    onChange={(e) => setShipping((s) => ({ ...s, lastName: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-hidden focus:ring-2"
                    style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600">Address Line 1</label>
                <input
                  type="text"
                  required
                  value={shipping.address1}
                  onChange={(e) => setShipping((s) => ({ ...s, address1: e.target.value }))}
                  className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-hidden focus:ring-2"
                  style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600">Address Line 2 (Optional)</label>
                <input
                  type="text"
                  value={shipping.address2}
                  onChange={(e) => setShipping((s) => ({ ...s, address2: e.target.value }))}
                  className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-hidden focus:ring-2"
                  style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">City</label>
                  <input
                    type="text"
                    required
                    value={shipping.city}
                    onChange={(e) => setShipping((s) => ({ ...s, city: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-hidden focus:ring-2"
                    style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">State</label>
                  <input
                    type="text"
                    required
                    value={shipping.state}
                    onChange={(e) => setShipping((s) => ({ ...s, state: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-hidden focus:ring-2"
                    style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">ZIP Code</label>
                  <input
                    type="text"
                    required
                    value={shipping.zip}
                    onChange={(e) => setShipping((s) => ({ ...s, zip: e.target.value }))}
                    className="w-full mt-1 px-3 py-2.5 border rounded-lg text-sm focus:outline-hidden focus:ring-2"
                    style={{ '--tw-ring-color': branding?.colors.primary } as React.CSSProperties}
                  />
                </div>
              </div>

              <button
                onClick={() => setStep('review')}
                disabled={!isShippingValid()}
                className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors hover:opacity-90 disabled:opacity-50 mt-4"
                style={{ backgroundColor: branding?.colors.primary ?? '#213cef' }}
              >
                Continue to Review
              </button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">Shipping To</h2>
                  <button
                    onClick={() => setStep('shipping')}
                    className="text-xs font-medium"
                    style={{ color: branding?.colors.primary }}
                  >
                    Edit
                  </button>
                </div>
                <div className="p-4 border rounded-xl text-sm">
                  <p className="font-medium">{shipping.firstName} {shipping.lastName}</p>
                  <p className="text-gray-600">{shipping.address1}</p>
                  {shipping.address2 && <p className="text-gray-600">{shipping.address2}</p>}
                  <p className="text-gray-600">{shipping.city}, {shipping.state} {shipping.zip}</p>
                  <p className="text-gray-500 mt-1">{email}</p>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold mb-3">Items</h2>
                <div className="space-y-2">
                  {cart.items.map((item) => (
                    <div key={item.storefrontProductId} className="flex items-center gap-3 p-3 border rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold">
                        {Number.isFinite(item.retailPrice)
                          ? `$${(item.retailPrice * item.quantity).toFixed(2)}`
                          : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>
              )}

              <button
                onClick={handlePlaceOrder}
                disabled={submitting}
                className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: branding?.colors.primary ?? '#213cef' }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                  </>
                ) : (
                  `Continue to Payment — $${total.toFixed(2)}`
                )}
              </button>
              <p className="text-center text-xs text-gray-400">
                Your card is charged on the next step.
              </p>
            </div>
          )}

          {step === 'pay' && payment && confirmation && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Payment</h2>
                <p className="text-sm text-gray-500">
                  Order <span className="font-medium">{confirmation.orderNumber}</span> ·{' '}
                  ${confirmation.total.toFixed(2)}
                </p>
              </div>
              <StorefrontPaymentForm
                payment={payment}
                amountLabel={`$${confirmation.total.toFixed(2)}`}
                primaryColor={branding?.colors.primary ?? '#213cef'}
                onPaid={({ pending }) => {
                  setConfirmation((prev) =>
                    prev ? { ...prev, paymentState: pending ? 'pending' : 'paid' } : prev
                  )
                  setStep('confirm')
                }}
              />
            </div>
          )}
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="border rounded-xl p-5 sticky top-24">
            <h3 className="font-semibold mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal ({cartItemCount} items)</span>
                <span>${safeSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span>{shippingCost === 0 ? 'Free' : `$${shippingCost.toFixed(2)}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold text-base">
                <span>Total</span>
                <span style={{ color: branding?.colors.primary }}>${total.toFixed(2)}</span>
              </div>
            </div>
            {safeSubtotal < 500 && shippingCost > 0 && (
              <p className="text-xs text-gray-500 mt-3">
                Add ${(500 - safeSubtotal).toFixed(2)} more for free shipping
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
