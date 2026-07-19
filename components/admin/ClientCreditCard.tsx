'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Gift } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface CreditPayload {
  balanceCents: number
  referralUrl: string | null
  referredBy: { id: string; organizationName: string } | null
  referredClinics: Array<{ id: string; organizationName: string; createdAt: string }>
  entries: Array<{
    id: string
    amountCents: number
    kind: string
    note: string | null
    createdAt: string
  }>
}

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** Referral store-credit position + manual adjustment, on the admin client page. */
export function ClientCreditCard({ clientId }: { clientId: string }) {
  const [data, setData] = useState<CreditPayload | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/credit`)
      if (res.ok) setData(await res.json())
    } catch {
      // non-critical card — stay quiet on load failures
    }
  }, [clientId])

  useEffect(() => {
    void load()
  }, [load])

  async function adjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(form.get('amount')), note: form.get('note') }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.message || 'Adjustment failed')
        return
      }
      toast.success('Credit adjusted')
      formEl.reset()
      void load()
    } finally {
      setBusy(false)
    }
  }

  if (!data) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="h-4 w-4 text-slate-500" /> Referral store credit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span>
            Balance: <strong className="text-lg text-emerald-700">{usd(data.balanceCents)}</strong>
          </span>
          {data.referredBy && (
            <span className="text-slate-500">
              Referred by <strong>{data.referredBy.organizationName}</strong>
            </span>
          )}
          <span className="text-slate-500">
            Referred {data.referredClinics.length} clinic{data.referredClinics.length === 1 ? '' : 's'}
          </span>
        </div>

        <form onSubmit={adjust} className="flex flex-wrap items-end gap-2">
          <input
            name="amount"
            type="number"
            step="0.01"
            required
            placeholder="± Amount $"
            className="w-32 rounded-md border px-3 py-2 text-sm"
          />
          <input
            name="note"
            required
            minLength={2}
            maxLength={500}
            placeholder="Reason (required, kept on the ledger)"
            className="min-w-[240px] flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {busy ? 'Saving…' : 'Adjust credit'}
          </Button>
        </form>

        {data.entries.length > 0 && (
          <div className="max-h-56 overflow-y-auto">
            <ul className="space-y-1.5 text-sm">
              {data.entries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{entry.note || entry.kind}</span>
                    <span className="text-xs text-slate-400">
                      {entry.kind} · {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <span className={`shrink-0 font-medium ${entry.amountCents >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {entry.amountCents >= 0 ? '+' : '−'}
                    {usd(Math.abs(entry.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
