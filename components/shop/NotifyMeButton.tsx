'use client'

import { useEffect, useState } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { toast } from 'sonner'

interface NotifyMeButtonProps {
  sku: string
}

/**
 * "Notify me when back in stock" toggle for out-of-stock products (PDP).
 * Arms a BackInStockSubscription for the practice; the alert fires once
 * (bell + email) on the next restock that makes the variant sellable.
 */
export function NotifyMeButton({ sku }: NotifyMeButtonProps) {
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/shop/back-in-stock')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return
        const skus: string[] = json?.data?.skus ?? json?.skus ?? []
        setSubscribed(skus.includes(sku))
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false)
      })
    return () => {
      cancelled = true
    }
  }, [sku])

  const toggle = async () => {
    if (busy || subscribed === null) return
    setBusy(true)
    try {
      const res = subscribed
        ? await fetch(`/api/shop/back-in-stock?sku=${encodeURIComponent(sku)}`, {
            method: 'DELETE',
          })
        : await fetch('/api/shop/back-in-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku }),
          })
      if (!res.ok) throw new Error('request failed')
      setSubscribed(!subscribed)
      toast.success(
        subscribed
          ? 'Restock alert removed.'
          : "You're on the list — we'll email you when it's back."
      )
    } catch {
      toast.error('Could not update the restock alert. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || subscribed === null}
      className={`flex h-14 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60 ${
        subscribed
          ? 'border-brand-primary/60 bg-brand-primary/10 text-brand-primary'
          : 'border-white/15 bg-white/5 text-white/80 hover:border-white/30 hover:text-white'
      }`}
    >
      {subscribed ? (
        <>
          <BellRing className="h-4 w-4" />
          We&rsquo;ll notify you when it&rsquo;s back
        </>
      ) : (
        <>
          <Bell className="h-4 w-4" />
          Notify me when back in stock
        </>
      )}
    </button>
  )
}
