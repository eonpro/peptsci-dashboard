'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { FileCheck2, ScrollText } from 'lucide-react'

interface Settings {
  org: {
    name: string
    compensationModel: 'COMMISSION' | 'MARGIN'
    commissionRateBps: number
    holdDays: number
    autoApproveEntries: boolean
    payoutMinimumCents: number
    w9OnFile: boolean
    w9FileName: string | null
    w9UploadedAt: string | null
    notifyByEmail: boolean
    msaSignedAt: string | null
  }
  rep: { name: string; commissionRateBps: number; msaSignedAt: string | null } | null
  role: 'OWNER' | 'ADMIN' | 'VIEWER' | null
  kind: 'ORG' | 'REP'
  tiers: Array<{ thresholdCents: number; bonusBps: number }>
  msaVersion: string
  partnerReferralUrl: string | null
}

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const pct = (bps: number) => `${bps / 100}%`

export default function PartnerTermsPage() {
  const [data, setData] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/partners/settings')
    if (res.ok) setData(await res.json())
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>

  const { org } = data
  const canManage = data.kind === 'ORG' && (data.role === 'OWNER' || data.role === 'ADMIN')

  async function toggleNotify(next: boolean) {
    setBusy(true)
    try {
      const res = await fetch('/api/partners/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyByEmail: next }),
      })
      if (res.ok) {
        toast.success(next ? 'Email notifications on' : 'Email notifications off')
        void load()
      }
    } finally {
      setBusy(false)
    }
  }

  async function uploadW9(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      toast.error('File too large (4MB max)')
      return
    }
    setBusy(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/partners/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, base64 }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload.message || 'Upload failed')
        return
      }
      toast.success('W-9 on file — you\u2019re payout-ready')
      void load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <ScrollText className="h-6 w-6 text-slate-400" /> Program terms
        </h1>
        <p className="text-sm text-slate-500">
          Everything that governs your program — rates, holds, payout policy — in one place.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Compensation</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Model</dt>
            <dd className="font-medium">
              {org.compensationModel === 'MARGIN'
                ? 'Margin — you price clinics above your floors and keep the spread'
                : `Revenue share — ${pct(org.commissionRateBps)} of attributed revenue`}
            </dd>
          </div>
          {data.rep && (
            <div>
              <dt className="text-slate-500">Your rep rate</dt>
              <dd className="font-medium">{pct(data.rep.commissionRateBps)}</dd>
            </div>
          )}
          {data.tiers.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Volume bonus tiers (quarter-to-date revenue)</dt>
              <dd className="mt-1 space-y-1">
                {data.tiers.map((tier) => (
                  <div key={tier.thresholdCents} className="text-sm font-medium">
                    ≥ {usd(tier.thresholdCents)} → +{pct(tier.bonusBps)} bonus rate
                  </div>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payout policy</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Commission hold</dt>
            <dd className="font-medium">
              {org.autoApproveEntries
                ? `Auto-approves ${org.holdDays} days after the sale (refund window)`
                : 'Approved manually by PeptSci'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Payout minimum</dt>
            <dd className="font-medium">{usd(org.payoutMinimumCents)} approved balance</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">W-9 (required before payouts)</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-3">
              {org.w9OnFile ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                  <FileCheck2 className="h-4 w-4" /> On file
                  {org.w9FileName ? ` — ${org.w9FileName}` : ''}
                </span>
              ) : (
                <span className="text-sm font-medium text-amber-600">Not on file yet</span>
              )}
              {canManage && (
                <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  {busy ? 'Uploading…' : org.w9OnFile ? 'Replace W-9' : 'Upload W-9'}
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void uploadW9(file)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Notifications</h2>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={org.notifyByEmail}
            disabled={!canManage || busy}
            onChange={(e) => void toggleNotify(e.target.checked)}
            className="h-4 w-4"
          />
          Email me when clinics are attributed, commissions accrue (daily digest), and payouts are
          recorded
        </label>
      </div>

      {data.partnerReferralUrl && (
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Refer another partner
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Know another sales org that should be here? Share your partner referral link — when
            they&rsquo;re approved and producing, PeptSci grants referral bonuses.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-slate-50 border px-2 py-1.5 text-xs">
              {data.partnerReferralUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(data.partnerReferralUrl!)
                toast.success('Partner referral link copied')
              }}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Agreement</h2>
        <p className="mt-3 text-sm">
          Marketing Services Agreement {data.msaVersion} —{' '}
          {(data.kind === 'REP' ? data.rep?.msaSignedAt : org.msaSignedAt) ? (
            <>
              signed{' '}
              {new Date(
                (data.kind === 'REP' ? data.rep!.msaSignedAt : org.msaSignedAt)!
              ).toLocaleDateString()}
              .{' '}
            </>
          ) : (
            'not signed yet. '
          )}
          <Link href="/partners/agreement" className="text-[#213cef] hover:underline">
            View the executed copy
          </Link>
        </p>
      </div>
    </div>
  )
}
