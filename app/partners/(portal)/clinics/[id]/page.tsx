'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

interface Payload {
  clinic: {
    id: string
    organizationName: string
    contactName: string | null
    contactEmail: string | null
    contactPhone: string | null
    onboardingStatus: string
    createdAt: string
    partnerRep: { id: string; name: string } | null
  }
  stage: string
  tags: string[]
  activity: Array<{
    id: string
    actorName: string | null
    type: string
    body: string
    createdAt: string
  }>
  transactions: Array<{
    id: string
    transactionDate: string
    description: string | null
    revenueCents: number
    refundedCents: number
  }>
}

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const STAGES = ['LEAD', 'ACTIVE', 'AT_RISK', 'DORMANT'] as const

export default function PartnerClinicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/partners/clinics/${id}`)
      const payload = await res.json()
      if (res.ok) setData(payload)
      else toast.error(payload.message || 'Failed to load clinic')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function patch(body: Record<string, unknown>, successMsg: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/partners/clinics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.message || 'Update failed')
        return
      }
      toast.success(successMsg)
      void load()
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
  if (!data) return <p className="py-10 text-center text-sm text-slate-400">Clinic not found.</p>

  const { clinic } = data

  return (
    <div className="space-y-6">
      <div>
        <Link href="/partners/clinics" className="mb-1 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> All clinics
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{clinic.organizationName}</h1>
        <p className="text-sm text-slate-500">
          {clinic.contactName && `${clinic.contactName} · `}
          {clinic.contactEmail}
          {clinic.partnerRep && ` · Rep: ${clinic.partnerRep.name}`} · Joined{' '}
          {new Date(clinic.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <label className="text-sm">
          <span className="mr-2 text-xs text-slate-500">Stage</span>
          <select
            value={data.stage}
            disabled={busy}
            onChange={(e) => void patch({ stage: e.target.value }, 'Stage updated')}
            className="rounded-md border px-2 py-1.5 text-sm"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-sm">
          <span className="mr-2 text-xs text-slate-500">Tags (comma-separated)</span>
          <input
            defaultValue={data.tags.join(', ')}
            disabled={busy}
            onBlur={(e) => {
              const tags = e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
              if (tags.join(',') !== data.tags.join(',')) void patch({ tags }, 'Tags updated')
            }}
            placeholder="e.g. weight-loss, west-coast"
            className="w-full min-w-[220px] rounded-md border px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Activity</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!note.trim()) return
              void patch({ note: note.trim() }, 'Note added').then(() => setNote(''))
            }}
            className="mb-4 flex gap-2"
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="Add a note…"
              className="flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !note.trim()}
              className="rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-50"
            >
              Add
            </button>
          </form>
          {data.activity.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.activity.map((a) => (
                <li key={a.id} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-sm text-slate-800">{a.body}</p>
                  <p className="text-xs text-slate-400">
                    {a.actorName || 'System'} · {new Date(a.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Transactions
          </h2>
          {data.transactions.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No transactions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{new Date(t.transactionDate).toLocaleDateString()}</td>
                    <td className="max-w-[200px] truncate py-2 pr-4 text-slate-500">{t.description || '—'}</td>
                    <td className="py-2 text-right">
                      {usd(t.revenueCents)}
                      {t.refundedCents > 0 && (
                        <span className="ml-1 text-xs text-red-500">(−{usd(t.refundedCents)})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
