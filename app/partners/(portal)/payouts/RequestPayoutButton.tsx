'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { HandCoins } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Readiness {
  approvedCents: number
  minimumCents: number
  w9OnFile: boolean
  hasOpenRequest: boolean
}

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** "Request payout" with server-checked gates (minimum, W-9, open request). */
export function RequestPayoutButton() {
  const [state, setState] = useState<Readiness | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/partners/payout-requests')
    if (res.ok) setState(await res.json())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!state) return null

  async function requestPayout() {
    setBusy(true)
    try {
      const res = await fetch('/api/partners/payout-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message || 'Could not request the payout')
        return
      }
      toast.success('Payout requested — the PeptSci team has been notified')
      void load()
    } finally {
      setBusy(false)
    }
  }

  if (state.hasOpenRequest) {
    return (
      <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
        Payout request pending — {usd(state.approvedCents)}
      </span>
    )
  }

  const eligible = state.w9OnFile && state.approvedCents >= state.minimumCents
  return (
    <Button
      size="sm"
      className="gap-1.5 font-semibold"
      disabled={busy || !eligible}
      onClick={() => void requestPayout()}
      title={
        !state.w9OnFile
          ? 'Upload your W-9 on the Terms page first'
          : state.approvedCents < state.minimumCents
            ? `Approved balance must reach ${usd(state.minimumCents)}`
            : undefined
      }
    >
      <HandCoins className="h-4 w-4" />
      {eligible
        ? `Request payout — ${usd(state.approvedCents)}`
        : !state.w9OnFile
          ? 'W-9 required for payouts'
          : `Minimum ${usd(state.minimumCents)} to request`}
    </Button>
  )
}
