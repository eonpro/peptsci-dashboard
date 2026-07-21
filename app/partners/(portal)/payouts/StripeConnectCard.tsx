'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Zap, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Stripe Express onboarding card for automated payouts. Shown to org
 * owners/admins when the program has PARTNER_STRIPE_PAYOUTS_ENABLED.
 */
export function StripeConnectCard({
  connected,
  payoutsEnabled,
}: {
  connected: boolean
  payoutsEnabled: boolean
}) {
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/partners/stripe-onboarding', { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.url) {
        toast.error(payload.message || 'Could not start Stripe onboarding.')
        return
      }
      window.location.href = payload.url
    } finally {
      setBusy(false)
    }
  }

  if (payoutsEnabled) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
        <div className="text-sm text-emerald-800">
          <strong>Automated payouts are on.</strong> Approved balances are transferred straight to
          your bank via Stripe.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Zap className="mt-0.5 h-5 w-5 text-blue-600 shrink-0" />
        <div className="text-sm text-slate-600">
          <strong className="text-slate-900">Get paid automatically.</strong>{' '}
          {connected
            ? 'Your Stripe account is created but onboarding is incomplete — finish it to enable transfers.'
            : 'Connect a Stripe account and payouts land in your bank without waiting on a manual check or wire.'}
        </div>
      </div>
      <Button size="sm" onClick={connect} disabled={busy} className="shrink-0">
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
        {connected ? 'Finish Stripe onboarding' : 'Connect payouts'}
      </Button>
    </div>
  )
}
