'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Gift, Users, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ReferralRow {
  id: string
  organizationName: string
  status: string
  joinedAt: string
  earnedCents: number
}

interface EntryRow {
  id: string
  amountCents: number
  kind: string
  note: string | null
  createdAt: string
  sourceClient: { organizationName: string } | null
}

interface Payload {
  code: string | null
  url: string | null
  approved: boolean
  rateBps: number
  balanceCents: number
  referrals: ReferralRow[]
  entries: EntryRow[]
}

const usd = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const KIND_LABEL: Record<string, string> = {
  EARNED: 'Earned',
  REVERSED: 'Reversed (refund)',
  REDEEMED: 'Applied to order',
  UNREDEEMED: 'Restored (refund)',
  ADJUSTMENT: 'Adjustment',
}

export default function ShopReferralsPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shop/referrals')
      const payload = await res.json()
      if (res.ok) setData(payload)
      else toast.error(payload.message || 'Failed to load referrals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !data) {
    return <p className="py-16 text-center text-sm text-white/50">Loading…</p>
  }
  if (!data) {
    return <p className="py-16 text-center text-sm text-white/50">Could not load referrals.</p>
  }

  const ratePct = data.rateBps / 100

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <Gift className="h-6 w-6 text-brand-primary" /> Refer &amp; Earn
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Share your link with other clinics. When they sign up and order, you earn{' '}
          <strong className="text-white">{ratePct}% back in store credit</strong> on every purchase
          they make — automatically, forever.
        </p>
      </div>

      {/* Referral link */}
      <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base text-white">Your referral link</CardTitle>
        </CardHeader>
        <CardContent>
          {data.url ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white">
                {data.url}
              </code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(data.url!)
                  toast.success('Link copied — share it with a clinic')
                }}
                className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a30c0]"
              >
                <Copy className="h-4 w-4" /> Copy
              </button>
            </div>
          ) : (
            <p className="text-sm text-white/50">
              Your referral link unlocks once your practice is approved.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Balance + referred clinics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
          <CardContent className="pt-6">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
              <Wallet className="h-4 w-4" /> Store credit balance
            </p>
            <p className="mt-1 text-3xl font-bold text-emerald-400">{usd(data.balanceCents)}</p>
            <p className="mt-1 text-xs text-white/40">
              Apply it at checkout — it works like cash on any order.
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
          <CardContent className="pt-6">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
              <Users className="h-4 w-4" /> Clinics referred
            </p>
            <p className="mt-1 text-3xl font-bold text-white">{data.referrals.length}</p>
            <p className="mt-1 text-xs text-white/40">
              Lifetime earned:{' '}
              {usd(data.referrals.reduce((sum, r) => sum + r.earnedCents, 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Referred clinics */}
      <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base text-white">Your referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {data.referrals.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/40">
              No referrals yet — copy your link above and send it to a colleague.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase text-white/40">
                  <th className="py-2 pr-4">Clinic</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Joined</th>
                  <th className="py-2 text-right">You earned</th>
                </tr>
              </thead>
              <tbody>
                {data.referrals.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-4 text-white">{r.organizationName}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === 'APPROVED'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {r.status === 'APPROVED' ? 'Active' : 'Pending approval'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-white/60">
                      {new Date(r.joinedAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 text-right font-medium text-emerald-400">
                      {usd(r.earnedCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Credit history */}
      <Card className="bg-[#0a0e3a] border-white/10 rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base text-white">Credit history</CardTitle>
        </CardHeader>
        <CardContent>
          {data.entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/40">No credit activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="min-w-0 text-sm">
                    <span className="block truncate text-white">
                      {entry.note || KIND_LABEL[entry.kind] || entry.kind}
                    </span>
                    <span className="text-xs text-white/40">
                      {KIND_LABEL[entry.kind] || entry.kind} ·{' '}
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-semibold ${
                      entry.amountCents >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {entry.amountCents >= 0 ? '+' : '−'}
                    {usd(Math.abs(entry.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
