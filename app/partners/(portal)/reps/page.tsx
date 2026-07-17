'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RepRow {
  id: string
  name: string
  email: string
  phone: string | null
  status: string
  commissionRateBps: number
  hasLogin: boolean
  msaSignedAt: string | null
  clinicCount: number
  linkCount: number
  revenueCents: number
  earnedCents: number
  unpaidCents: number
  paidCents: number
}

const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export default function PartnerRepsPage() {
  const [reps, setReps] = useState<RepRow[]>([])
  const [orgRateBps, setOrgRateBps] = useState(0)
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [rateEdit, setRateEdit] = useState<{ repId: string; name: string; value: string } | null>(
    null
  )
  const [savingRate, setSavingRate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partners/reps')
      const data = await res.json()
      if (res.ok) {
        setReps(data.reps)
        setOrgRateBps(data.orgRateBps)
      } else {
        toast.error(data.message || 'Failed to load reps')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    setInviting(true)
    try {
      const res = await fetch('/api/partners/reps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          phone: form.get('phone') || '',
          ratePercent: Number(form.get('ratePercent') || 0),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to invite rep')
        return
      }
      toast.success('Rep invited — they set up their login from the email invitation')
      formEl.reset()
      void load()
    } finally {
      setInviting(false)
    }
  }

  async function update(repId: string, patch: { ratePercent?: number; status?: 'ACTIVE' | 'SUSPENDED' }) {
    const res = await fetch('/api/partners/reps', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repId, ...patch }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.message || 'Failed to update rep')
      return
    }
    toast.success('Rep updated')
    void load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sales reps</h1>
        <p className="text-sm text-slate-500">
          Invite reps, set their commission carve-out (out of your org rate
          {orgRateBps > 0 ? ` of ${orgRateBps / 100}%` : ''}), and track their book.
        </p>
      </div>

      <form onSubmit={invite} className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-4">
        <UserPlus className="mb-2 h-4 w-4 text-slate-400" />
        <input name="name" required placeholder="Full name *" className="rounded-md border px-3 py-2 text-sm" />
        <input name="email" type="email" required placeholder="Email *" className="rounded-md border px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone" className="w-32 rounded-md border px-3 py-2 text-sm" />
        <input
          name="ratePercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          placeholder="Rate %"
          className="w-24 rounded-md border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={inviting}
          className="rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
        >
          {inviting ? 'Inviting…' : 'Invite rep'}
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Rep</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3 text-right">Clinics</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">Earned</th>
              <th className="px-4 py-3 text-right">Unpaid</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading…</td>
              </tr>
            )}
            {!loading && reps.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  No reps yet — invite your first rep above.
                </td>
              </tr>
            )}
            {reps.map((rep) => (
              <tr key={rep.id} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{rep.name}</div>
                  <div className="text-xs text-slate-400">{rep.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      rep.status === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-700'
                        : rep.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-600'
                    }`}
                  >
                    {rep.status === 'PENDING' ? 'Invite sent' : rep.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    className="text-[#213cef] hover:underline"
                    aria-label={`Edit commission rate for ${rep.name}`}
                    onClick={() =>
                      setRateEdit({
                        repId: rep.id,
                        name: rep.name,
                        value: String(rep.commissionRateBps / 100),
                      })
                    }
                  >
                    {rep.commissionRateBps / 100}%
                  </button>
                </td>
                <td className="px-4 py-3 text-right">{rep.clinicCount}</td>
                <td className="px-4 py-3 text-right">{usd(rep.revenueCents)}</td>
                <td className="px-4 py-3 text-right">{usd(rep.earnedCents)}</td>
                <td className="px-4 py-3 text-right text-amber-600">{usd(rep.unpaidCents)}</td>
                <td className="px-4 py-3 text-right">
                  {rep.status !== 'PENDING' && (
                    <button
                      onClick={() =>
                        void update(rep.id, { status: rep.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })
                      }
                      className="text-sm text-slate-500 hover:underline"
                    >
                      {rep.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!rateEdit} onOpenChange={(open) => !open && setRateEdit(null)}>
        <DialogContent className="max-w-sm bg-white text-slate-900 border-slate-200">
          <DialogHeader>
            <DialogTitle>Edit commission rate</DialogTitle>
            <DialogDescription className="text-slate-500">
              {rateEdit?.name}&apos;s carve-out from your org rate
              {orgRateBps > 0 ? ` (max ${orgRateBps / 100}%)` : ''}.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!rateEdit) return
              const value = Number(rateEdit.value)
              if (!Number.isFinite(value) || value < 0 || value > 100) {
                toast.error('Enter a rate between 0 and 100')
                return
              }
              setSavingRate(true)
              try {
                await update(rateEdit.repId, { ratePercent: value })
                setRateEdit(null)
              } finally {
                setSavingRate(false)
              }
            }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <label htmlFor="rep-rate" className="sr-only">
                Commission rate percent
              </label>
              <input
                id="rep-rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                autoFocus
                value={rateEdit?.value ?? ''}
                onChange={(e) =>
                  setRateEdit((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                }
                className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setRateEdit(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingRate}
                className="rounded-lg bg-[#213cef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a30c4] disabled:opacity-60"
              >
                {savingRate ? 'Saving…' : 'Save rate'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
