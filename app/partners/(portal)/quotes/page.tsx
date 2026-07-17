'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Printer, Trash2 } from 'lucide-react'

interface CatalogRow {
  variantId: string
  sku: string | null
  name: string
  dose: string | null
  srpCents: number
  floorCents: number | null
}

interface QuoteItem {
  variantId: string
  name: string
  dose: string | null
  quantity: number
  unitPriceCents: number
  totalCents: number
}

interface Quote {
  id: string
  clinicName: string
  contactName: string | null
  email: string | null
  notes: string | null
  items: QuoteItem[]
  totalCents: number
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED'
  createdAt: string
  rep: { name: string } | null
}

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const STATUS_BADGE: Record<Quote['status'], string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-red-100 text-red-600',
}

export default function PartnerQuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [catalog, setCatalog] = useState<CatalogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partners/quotes')
      const data = await res.json()
      if (res.ok) {
        setQuotes(data.quotes)
        setCatalog(data.catalog)
      } else {
        toast.error(data.message || 'Failed to load quotes')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(quoteId: string, status: Quote['status']) {
    const res = await fetch('/api/partners/quotes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, status }),
    })
    if (res.ok) {
      toast.success('Quote updated')
      void load()
    } else {
      toast.error('Failed to update quote')
    }
  }

  function printQuote(quote: Quote) {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = quote.items
      .map(
        (i) =>
          `<tr><td>${i.name} ${i.dose ?? ''}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${usd(i.unitPriceCents)}</td><td style="text-align:right">${usd(i.totalCents)}</td></tr>`
      )
      .join('')
    win.document.write(`<!DOCTYPE html><html><head><title>Quote — ${quote.clinicName}</title>
      <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:40px;color:#1a1a2e}
      table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:8px;border-bottom:1px solid #eee;text-align:left}
      tfoot td{font-weight:700;border-top:2px solid #1a1a2e}</style></head><body>
      <h1 style="letter-spacing:1px">PEPTSCI</h1><h2>Price quote</h2>
      <p><strong>${quote.clinicName}</strong>${quote.contactName ? ` · ${quote.contactName}` : ''}${quote.email ? ` · ${quote.email}` : ''}<br>
      Prepared ${new Date(quote.createdAt).toLocaleDateString()}</p>
      <table><thead><tr><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td style="text-align:right">${usd(quote.totalCents)}</td></tr></tfoot></table>
      ${quote.notes ? `<p style="margin-top:16px;color:#555">${quote.notes}</p>` : ''}
      <script>window.print()</script></body></html>`)
    win.document.close()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotes</h1>
          <p className="text-sm text-slate-500">
            Build price quotes for prospective clinics, print them, and track their status.
          </p>
        </div>
        <button
          onClick={() => setBuilding((v) => !v)}
          className="flex items-center gap-1 rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4]"
        >
          <Plus className="h-4 w-4" /> New quote
        </button>
      </div>

      {building && (
        <QuoteBuilder
          catalog={catalog}
          onDone={() => {
            setBuilding(false)
            void load()
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Clinic</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td>
              </tr>
            )}
            {!loading && quotes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No quotes yet — build your first quote above.
                </td>
              </tr>
            )}
            {quotes.map((quote) => (
              <tr key={quote.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{quote.clinicName}</div>
                  <div className="text-xs text-slate-400">
                    {quote.contactName || quote.email || ''}
                    {quote.rep && ` · ${quote.rep.name}`}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {quote.items.length} item{quote.items.length === 1 ? '' : 's'}
                </td>
                <td className="px-4 py-3 text-right font-medium">{usd(quote.totalCents)}</td>
                <td className="px-4 py-3">
                  <select
                    value={quote.status}
                    onChange={(e) => void setStatus(quote.id, e.target.value as Quote['status'])}
                    className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_BADGE[quote.status]}`}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="SENT">Sent</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="DECLINED">Declined</option>
                  </select>
                </td>
                <td className="px-4 py-3">{new Date(quote.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => printQuote(quote)}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="Print quote"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QuoteBuilder({ catalog, onDone }: { catalog: CatalogRow[]; onDone: () => void }) {
  const [lines, setLines] = useState<Array<{ variantId: string; quantity: number; price: string }>>([])
  const [submitting, setSubmitting] = useState(false)

  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.variantId, c])), [catalog])

  const totalCents = lines.reduce((sum, line) => {
    const row = catalogById.get(line.variantId)
    if (!row) return sum
    const unit = line.price ? Math.round(Number(line.price) * 100) : row.srpCents
    return sum + (Number.isFinite(unit) ? unit * line.quantity : 0)
  }, 0)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const items = lines
      .filter((l) => l.variantId && l.quantity > 0)
      .map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        ...(l.price ? { unitPriceCents: Math.round(Number(l.price) * 100) } : {}),
      }))
    if (items.length === 0) {
      toast.error('Add at least one product')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/partners/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicName: form.get('clinicName'),
          contactName: form.get('contactName') || '',
          email: form.get('email') || '',
          notes: form.get('notes') || '',
          items,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to create quote')
        return
      }
      toast.success('Quote created')
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border bg-white p-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <input name="clinicName" required placeholder="Clinic name *" className="rounded-md border px-3 py-2 text-sm" />
        <input name="contactName" placeholder="Contact name" className="rounded-md border px-3 py-2 text-sm" />
        <input name="email" type="email" placeholder="Contact email" className="rounded-md border px-3 py-2 text-sm" />
      </div>

      {lines.map((line, index) => {
        const row = catalogById.get(line.variantId)
        return (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              value={line.variantId}
              onChange={(e) =>
                setLines((ls) => ls.map((l, i) => (i === index ? { ...l, variantId: e.target.value } : l)))
              }
              className="min-w-[260px] flex-1 rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Product…</option>
              {catalog.map((c) => (
                <option key={c.variantId} value={c.variantId}>
                  {c.name} {c.dose ?? ''} — SRP {usd(c.srpCents)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={line.quantity}
              onChange={(e) =>
                setLines((ls) =>
                  ls.map((l, i) => (i === index ? { ...l, quantity: Number(e.target.value) || 1 } : l))
                )
              }
              className="w-20 rounded-md border px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min={row?.floorCents ? row.floorCents / 100 : 0}
              value={line.price}
              placeholder={row ? (row.srpCents / 100).toFixed(2) : 'Unit $'}
              onChange={(e) =>
                setLines((ls) => ls.map((l, i) => (i === index ? { ...l, price: e.target.value } : l)))
              }
              className="w-28 rounded-md border px-3 py-2 text-sm"
            />
            {row?.floorCents != null && (
              <span className="text-xs text-slate-400">floor {usd(row.floorCents)}</span>
            )}
            <button
              type="button"
              onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}
              className="text-slate-400 hover:text-red-600"
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, { variantId: '', quantity: 1, price: '' }])}
          className="rounded-md border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          + Add product
        </button>
        <span className="text-sm text-slate-500">
          Total: <strong className="text-slate-900">{usd(totalCents)}</strong>
        </span>
      </div>

      <textarea name="notes" rows={2} placeholder="Notes (shown on the quote)" className="w-full rounded-md border px-3 py-2 text-sm" />

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-[#213cef] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
      >
        {submitting ? 'Creating…' : 'Create quote'}
      </button>
    </form>
  )
}
