'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Loader2, XCircle, Package } from 'lucide-react'

type Status = 'loading' | 'success' | 'pending' | 'failed'

function SuccessContent() {
  const params = useSearchParams()
  const orderParam = params.get('order')
  const paymentIntentId = params.get('payment_intent')

  const [status, setStatus] = useState<Status>('loading')
  const [orderId, setOrderId] = useState<string | null>(orderParam)
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    let active = true

    async function finalize() {
      // Redirect-based flow: confirm the PaymentIntent server-side.
      if (paymentIntentId) {
        try {
          const res = await fetch('/api/shop/checkout/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId, saveCard: true }),
          })
          const data = await res.json()
          if (!active) return
          if (data.orderId) setOrderId(data.orderId)
          if (res.ok && data.success) {
            setStatus('success')
          } else if (data.paymentStatus === 'AUTHORIZED' || data.stripeStatus === 'processing') {
            setStatus('pending')
            setMessage('Your payment is processing. We will confirm your order shortly.')
          } else {
            setStatus('failed')
            setMessage(data.message || 'Your payment could not be completed.')
          }
        } catch {
          if (active) {
            setStatus('failed')
            setMessage('We could not verify your payment.')
          }
        }
        return
      }

      // Direct (non-redirect) flow: order already confirmed by the checkout page.
      if (orderParam) {
        setStatus('success')
      } else {
        setStatus('failed')
        setMessage('Missing order reference.')
      }
    }

    void finalize()
    return () => {
      active = false
    }
  }, [paymentIntentId, orderParam])

  if (status === 'loading') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <Loader2 className="h-12 w-12 text-brand-primary animate-spin mb-4" />
        <p className="text-white/60">Confirming your payment…</p>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <div className="rounded-full bg-red-500/20 p-8 mb-6">
          <XCircle className="h-16 w-16 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Payment Not Completed</h1>
        <p className="text-white/60 mb-8 max-w-[320px]">{message}</p>
        <Button asChild className="h-12 px-8 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl">
          <Link href="/shop/checkout">Try Again</Link>
        </Button>
      </div>
    )
  }

  const isPending = status === 'pending'

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className={`rounded-full p-8 mb-6 ${isPending ? 'bg-amber-500/20' : 'bg-green-500/20'}`}>
        {isPending ? (
          <Loader2 className="h-16 w-16 text-amber-400 animate-spin" />
        ) : (
          <CheckCircle2 className="h-16 w-16 text-green-400" />
        )}
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">
        {isPending ? 'Payment Processing' : 'Order Placed Successfully!'}
      </h1>
      <p className="text-white/60 mb-8 max-w-[340px]">
        {isPending
          ? message
          : 'Thank you for your order. You will receive a confirmation email shortly.'}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild className="h-12 px-6 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl">
          <Link href={orderId ? `/shop/orders/${orderId}` : '/shop/orders'}>
            <Package className="mr-2 h-4 w-4" /> View Order
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-12 px-6 border-white/20 text-white hover:bg-white/10 rounded-xl"
        >
          <Link href="/shop">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-12 w-12 text-brand-primary animate-spin" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  )
}
