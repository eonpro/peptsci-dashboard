'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CreditCard, Link2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type SavedCard = {
  id: string
  stripePaymentMethodId: string
  cardBrand: string | null
  cardLast4: string | null
  expiryMonth: number | null
  expiryYear: number | null
  cardholderName: string | null
  isDefault: boolean
}

type StripePayload = {
  stripeCustomerId: string | null
  organizationName: string
  paymentMethods: SavedCard[]
}

/**
 * Admin card: link an existing Stripe Customer (cus_…) and sync saved cards.
 */
export function ClientStripeCard({
  clientId,
  onLinked,
}: {
  clientId: string
  onLinked?: () => void
}) {
  const [data, setData] = useState<StripePayload | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/stripe`)
      if (!res.ok) return
      const payload = (await res.json()) as StripePayload
      setData(payload)
      if (payload.stripeCustomerId) setCustomerId(payload.stripeCustomerId)
    } catch {
      // non-critical
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  async function postLink(force: boolean) {
    const id = customerId.trim()
    if (!id) {
      toast.error('Paste a Stripe customer id (cus_…)')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeCustomerId: id, force }),
      })
      const payload = await res.json().catch(() => ({}))
      if (res.status === 409 && payload?.code === 'CUSTOMER_IN_USE' && !force) {
        const ok = window.confirm(
          `${payload.message || 'Customer already linked'}.\n\nMove it to this client and sync cards?`
        )
        if (ok) {
          setBusy(false)
          await postLink(true)
        }
        return
      }
      if (!res.ok) {
        toast.error(payload.message || 'Could not link Stripe customer')
        return
      }
      const synced = Array.isArray(payload.cardsSynced) ? payload.cardsSynced.length : 0
      toast.success(
        synced > 0
          ? `Linked ${payload.stripeCustomerId} · ${synced} card${synced === 1 ? '' : 's'} synced`
          : `Linked ${payload.stripeCustomerId} (no cards on file in Stripe)`
      )
      await load()
      onLinked?.()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payment profile…
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-slate-500" /> Payment profile (Stripe)
        </CardTitle>
        <CardDescription>
          Link an existing Como RX Stripe customer so this practice can pay with a saved card.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.stripeCustomerId ? (
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
            <div className="text-white/50 text-xs uppercase tracking-wide">Linked customer</div>
            <div className="font-mono text-white break-all">{data.stripeCustomerId}</div>
          </div>
        ) : (
          <p className="text-sm text-amber-300/90">No Stripe customer linked yet.</p>
        )}

        {(data?.paymentMethods?.length ?? 0) > 0 ? (
          <ul className="space-y-2">
            {data!.paymentMethods.map((pm) => (
              <li
                key={pm.id}
                className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"
              >
                <span className="text-white">
                  {(pm.cardBrand ?? 'Card').toUpperCase()} ···· {pm.cardLast4 ?? '????'}
                  {pm.expiryMonth && pm.expiryYear
                    ? ` · ${String(pm.expiryMonth).padStart(2, '0')}/${pm.expiryYear}`
                    : ''}
                  {pm.cardholderName ? (
                    <span className="text-white/50"> · {pm.cardholderName}</span>
                  ) : null}
                </span>
                {pm.isDefault ? (
                  <Badge variant="outline" className="border-green-500/30 text-green-400">
                    Default
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        ) : data?.stripeCustomerId ? (
          <p className="text-sm text-white/50">No saved cards synced yet.</p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={`stripe-cus-${clientId}`} className="text-white/70">
            Stripe customer id
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id={`stripe-cus-${clientId}`}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="cus_…"
              className="h-11 bg-white/5 border-white/10 text-white font-mono"
              disabled={busy}
            />
            <Button
              type="button"
              onClick={() => void postLink(false)}
              disabled={busy || !customerId.trim()}
              className="shrink-0"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Link2 className="h-4 w-4 mr-2" />
              )}
              {data?.stripeCustomerId ? 'Re-link & sync cards' : 'Link & sync cards'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
