'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

interface PriceRow {
  variantId: string
  sku: string | null
  name: string
  dose: string | null
  srpCents: number
  floorCents: number
  currentPriceCents: number | null
}

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function PartnerPricingPage() {
  const [clinics, setClinics] = useState<Array<{ id: string; organizationName: string }>>([])
  const [clientId, setClientId] = useState('')
  const [items, setItems] = useState<PriceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async (selected: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/partners/pricing${selected ? `?clientId=${selected}` : ''}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to load pricing')
        return
      }
      setClinics(data.clinics)
      setItems(data.items)
      setDrafts({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load('')
  }, [load])

  async function save(row: PriceRow) {
    const draft = drafts[row.variantId]
    const dollars = Number(draft)
    if (!draft || !Number.isFinite(dollars) || dollars <= 0) {
      toast.error('Enter a valid price')
      return
    }
    const priceCents = Math.round(dollars * 100)
    if (priceCents < row.floorCents) {
      toast.error(`Price can't be below your floor of ${usd(row.floorCents)}`)
      return
    }
    const res = await fetch('/api/partners/pricing', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, variantId: row.variantId, priceCents }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.message || 'Failed to save price')
      return
    }
    toast.success('Price saved — the clinic sees it immediately')
    void load(clientId)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Clinic pricing</h1>
        <p className="text-sm text-slate-500">
          Set what each clinic pays per product. Your margin is the spread above your wholesale
          floor — earned automatically on every order.
        </p>
      </div>

      <select
        value={clientId}
        onChange={(e) => {
          setClientId(e.target.value)
          if (e.target.value) void load(e.target.value)
          else setItems([])
        }}
        className="rounded-md border bg-white px-3 py-2 text-sm"
      >
        <option value="">Select a clinic…</option>
        {clinics.map((c) => (
          <option key={c.id} value={c.id}>
            {c.organizationName}
          </option>
        ))}
      </select>

      {clientId && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Your floor</th>
                <th className="px-4 py-3 text-right">List (SRP)</th>
                <th className="px-4 py-3 text-right">Clinic price</th>
                <th className="px-4 py-3 text-right">Your margin</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No products have wholesale floors set for your org yet — contact PeptSci.
                  </td>
                </tr>
              )}
              {items.map((row) => {
                const draft = drafts[row.variantId]
                const effective =
                  draft !== undefined && draft !== ''
                    ? Math.round(Number(draft) * 100)
                    : (row.currentPriceCents ?? row.srpCents)
                const margin = Number.isFinite(effective) ? effective - row.floorCents : 0
                return (
                  <tr key={row.variantId} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-slate-400">
                        {row.dose}
                        {row.sku ? ` · ${row.sku}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{usd(row.floorCents)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{usd(row.srpCents)}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min={row.floorCents / 100}
                        value={draft ?? (row.currentPriceCents != null ? (row.currentPriceCents / 100).toFixed(2) : '')}
                        placeholder={(row.srpCents / 100).toFixed(2)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.variantId]: e.target.value }))}
                        className="w-28 rounded-md border px-2 py-1.5 text-right text-sm"
                      />
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${margin < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {Number.isFinite(margin) ? usd(Math.max(0, margin)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void save(row)}
                        disabled={draft === undefined || draft === ''}
                        className="rounded-md bg-[#213cef] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-40"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
