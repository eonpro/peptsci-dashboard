'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatCents, formatBps } from '@/lib/partners/commission'
import { referralUrl } from '@/lib/partners/referral'

interface Rep {
  id: string
  name: string
  email: string
  status: string
  commissionRateBps: number
  clerkUserId: string | null
}

interface OrgDetail {
  id: string
  name: string
  contactName: string | null
  contactEmail: string
  contactPhone: string | null
  website: string | null
  notes: string | null
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
  compensationModel: 'COMMISSION' | 'MARGIN'
  commissionRateBps: number
  autoApproveEntries: boolean
  holdDays: number
  payoutMinimumCents: number
  stripeConnectAccountId: string | null
  stripePayoutsEnabled: boolean
  w9BlobUrl: string | null
  msaSignedAt: string | null
  clerkUserId: string | null
  createdAt: string
  leads: Array<{
    id: string
    clinicName: string
    email: string | null
    npiNumber: string | null
    status: string
    protectedUntil: string
    rep: { name: string } | null
    matchedClient: { id: string; organizationName: string } | null
  }>
  payoutRequests: Array<{
    id: string
    payee: string
    repId: string | null
    amountCents: number
    note: string | null
    createdAt: string
  }>
  referredByOrg: { id: string; name: string } | null
  reps: Rep[]
  members: Array<{ id: string; name: string; email: string; role: string; status: string }>
  referralLinks: Array<{
    id: string
    code: string
    label: string | null
    active: boolean
    clickCount: number
    signupCount: number
    repId: string | null
  }>
  clients: Array<{
    id: string
    organizationName: string
    contactEmail: string | null
    onboardingStatus: string
    partnerRepId: string | null
    createdAt: string
  }>
  pricing: Array<{
    id: string
    variantId: string
    floorCents: number
    variant: { sku: string | null; dose: string | null; product: { name: string } }
  }>
  agreements: Array<{
    id: string
    signerKind: string
    signerName: string
    documentVersion: string
    signedAt: string
    repId: string | null
  }>
  payouts: Array<{
    id: string
    payee: string
    repId: string | null
    amountCents: number
    method: string | null
    reference: string | null
    paidAt: string
  }>
}

interface DetailPayload {
  org: OrgDetail
  summary: { ownCents: number; repCents: number; unpaidCents: number; paidCents: number }
  totals: { unpaidCents: number; paidCents: number }
  revenue: { revenueCents: number; refundedCents: number; transactionCount: number; clinicCount: number }
  pendingCount: number
  approvedCount: number
  transactions: Array<{
    id: string
    transactionDate: string
    description: string | null
    reference: string | null
    revenueCents: number
    refundedCents: number
    source: string
    client: { organizationName: string } | null
    entries: Array<{ id: string; payee: string; kind: string; amountCents: number; status: string }>
  }>
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 border border-amber-400/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30',
  SUSPENDED: 'bg-red-500/15 text-red-300 border border-red-400/30',
}

const inputClass = 'rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground'

export default function PartnerOrgAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<DetailPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [allClients, setAllClients] = useState<Array<{ id: string; organizationName: string }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/partners/${id}`)
      const payload = await res.json()
      if (res.ok) setData(payload)
      else toast.error(payload.message || 'Failed to load partner org')
    } catch {
      toast.error('Failed to load partner org')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    fetch('/api/admin/clients')
      .then((r) => r.json())
      .then((d) => setAllClients(d.clients ?? []))
      .catch(() => {})
  }, [])

  const act = useCallback(
    async (fn: () => Promise<Response>, successMsg: string) => {
      setBusy(true)
      try {
        const res = await fn()
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(payload.message || 'Action failed')
          return false
        }
        toast.success(successMsg)
        await load()
        return true
      } finally {
        setBusy(false)
      }
    },
    [load]
  )

  const repById = useMemo(() => {
    const map = new Map<string, Rep>()
    for (const rep of data?.org.reps ?? []) map.set(rep.id, rep)
    return map
  }, [data])

  if (loading && !data) return <p className="p-10 text-center text-sm text-muted-foreground/70">Loading…</p>
  if (!data) return <p className="p-10 text-center text-sm text-muted-foreground/70">Partner org not found.</p>

  const { org, summary, totals, revenue, pendingCount, approvedCount, transactions } = data
  const attributedIds = new Set(org.clients.map((c) => c.id))
  const attachable = allClients.filter((c) => !attributedIds.has(c.id))

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/partners-admin" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> All partners
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{org.name}</h1>
            <Badge className={STATUS_BADGE[org.status]}>{org.status}</Badge>
            {org.msaSignedAt ? (
              <Badge className="bg-blue-500/15 text-blue-300 border border-blue-400/30">MSA signed</Badge>
            ) : (
              <Badge className="bg-muted/60 text-foreground/80">MSA unsigned</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {org.contactName ? `${org.contactName} · ` : ''}
            {org.contactEmail}
            {org.contactPhone ? ` · ${org.contactPhone}` : ''}
          </p>
          {org.referredByOrg && (
            <p className="mt-1 text-xs text-muted-foreground">
              Referred by <strong>{org.referredByOrg.name}</strong>{' '}
              {org.status === 'ACTIVE' && (
                <button
                  className="ml-1 text-emerald-500 hover:underline"
                  disabled={busy}
                  onClick={() => {
                    const amount = window.prompt(
                      `Grant a partner-referral bonus to ${org.referredByOrg!.name} — amount $:`,
                      '250'
                    )
                    if (amount === null) return
                    const value = Number(amount)
                    if (!Number.isFinite(value) || value <= 0) {
                      toast.error('Enter a valid amount')
                      return
                    }
                    void act(
                      () =>
                        fetch(`/api/admin/partners/${id}/referral-bonus`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ amount: value }),
                        }),
                      'Referral bonus granted'
                    )
                  }}
                >
                  Grant referral bonus
                </button>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Refresh
          </Button>
          {org.status === 'PENDING' && (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void act(
                    () =>
                      fetch(`/api/admin/partners/${id}/approve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'approve' }),
                      }),
                    'Partner approved — sign-up invitation sent'
                  )
                }
              >
                Approve &amp; invite
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt('Rejection reason (emailed to the applicant, optional):') ?? undefined
                  void act(
                    () =>
                      fetch(`/api/admin/partners/${id}/approve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'reject', reason }),
                      }),
                    'Application rejected'
                  )
                }}
              >
                Reject
              </Button>
            </>
          )}
          {org.status === 'ACTIVE' && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(
                  () =>
                    fetch(`/api/admin/partners/${id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'SUSPENDED' }),
                    }),
                  'Partner suspended'
                )
              }
            >
              Suspend
            </Button>
          )}
          {org.status === 'SUSPENDED' && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(
                  () =>
                    fetch(`/api/admin/partners/${id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'ACTIVE' }),
                    }),
                  'Partner reactivated'
                )
              }
            >
              Reactivate
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Attributed revenue" value={formatCents(revenue.revenueCents)} />
        <Kpi label="Org commission" value={formatCents(summary.ownCents)} />
        <Kpi label="Rep carve-outs" value={formatCents(summary.repCents)} />
        <Kpi label="Unpaid" value={formatCents(totals.unpaidCents)} tone="amber" />
        <Kpi label="Paid out" value={formatCents(totals.paidCents)} tone="emerald" />
      </div>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compensation settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              void act(
                () =>
                  fetch(`/api/admin/partners/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      compensationModel: form.get('compensationModel'),
                      commissionRateBps: Math.round(Number(form.get('ratePercent') || 0) * 100),
                      autoApproveEntries: form.get('autoApprove') === 'on',
                      holdDays: Math.max(0, Math.round(Number(form.get('holdDays') || 0))),
                      payoutMinimumCents: Math.max(0, Math.round(Number(form.get('payoutMin') || 0) * 100)),
                    }),
                  }),
                'Settings saved'
              )
            }}
          >
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Model</span>
              <select name="compensationModel" defaultValue={org.compensationModel} className={inputClass}>
                <option value="COMMISSION">Commission (% of revenue)</option>
                <option value="MARGIN">Margin (price above floor)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Org commission rate %</span>
              <input
                name="ratePercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={org.commissionRateBps / 100}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Hold days</span>
              <input
                name="holdDays"
                type="number"
                min="0"
                max="365"
                defaultValue={org.holdDays}
                className={`${inputClass} w-24`}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Payout min $</span>
              <input
                name="payoutMin"
                type="number"
                step="1"
                min="0"
                defaultValue={org.payoutMinimumCents / 100}
                className={`${inputClass} w-28`}
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" name="autoApprove" defaultChecked={org.autoApproveEntries} />
              Auto-approve after hold
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              Save
            </Button>
            <p className="basis-full text-xs text-muted-foreground/70">
              Rate changes apply to future transactions only; recorded ledger entries are frozen.
              {org.compensationModel === 'MARGIN' && ' Margin orgs earn the spread above per-product floors (set below).'}
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Ledger & payouts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commission ledger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {org.payoutRequests.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Payout requested:</strong>{' '}
              {org.payoutRequests
                .map(
                  (r) =>
                    `${r.payee === 'ORG' ? 'Organization' : repById.get(r.repId ?? '')?.name || 'Rep'} — ${formatCents(r.amountCents)} (${new Date(r.createdAt).toLocaleDateString()})`
                )
                .join(' · ')}
              {' — '}record the payout below to resolve.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              <strong>{pendingCount}</strong> pending · <strong>{approvedCount}</strong> approved awaiting payout
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || pendingCount === 0}
              onClick={() =>
                void act(
                  () =>
                    fetch(`/api/admin/partners/${id}/entries`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'approve', all: true }),
                    }),
                  'Pending entries approved'
                )
              }
            >
              Approve all pending
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                const method = window.prompt('Payout method (check / ACH / wire):') ?? ''
                const reference = window.prompt('Reference (check # / transfer id, optional):') ?? ''
                void act(
                  () =>
                    fetch(`/api/admin/partners/${id}/payouts`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ payee: 'ORG', method, reference }),
                    }),
                  'Org payout recorded'
                )
              }}
            >
              Record org payout
            </Button>
            {org.stripePayoutsEnabled && (
              <Button
                size="sm"
                disabled={busy}
                className="bg-[#635bff] text-white hover:bg-[#5449e0]"
                onClick={() => {
                  if (
                    !window.confirm(
                      'Pay the org’s full approved balance via Stripe transfer? Money moves immediately.'
                    )
                  )
                    return
                  void act(
                    () =>
                      fetch(`/api/admin/partners/${id}/payouts`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ payee: 'ORG', viaStripe: true }),
                      }),
                    'Stripe payout sent'
                  )
                }}
              >
                Pay org via Stripe
              </Button>
            )}
            {org.reps
              .filter((rep) => rep.status === 'ACTIVE')
              .map((rep) => (
                <Button
                  key={rep.id}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    const method = window.prompt(`Payout method for ${rep.name} (check / ACH / wire):`) ?? ''
                    const reference = window.prompt('Reference (optional):') ?? ''
                    void act(
                      () =>
                        fetch(`/api/admin/partners/${id}/payouts`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ payee: 'REP', repId: rep.id, method, reference }),
                        }),
                      `Payout recorded for ${rep.name}`
                    )
                  }}
                >
                  Pay {rep.name}
                </Button>
              ))}
          </div>
          {org.payouts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Payee</th>
                    <th className="py-2 pr-4">Method</th>
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {org.payouts.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{new Date(p.paidAt).toLocaleDateString()}</td>
                      <td className="py-2 pr-4">
                        {p.payee === 'ORG' ? 'Organization' : repById.get(p.repId ?? '')?.name || 'Rep'}
                      </td>
                      <td className="py-2 pr-4">{p.method || '—'}</td>
                      <td className="py-2 pr-4">{p.reference || '—'}</td>
                      <td className="py-2 text-right font-medium">{formatCents(p.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const formEl = e.currentTarget
              const form = new FormData(formEl)
              void act(
                () =>
                  fetch(`/api/admin/partners/${id}/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      clientId: form.get('clientId'),
                      transactionDate: form.get('date'),
                      description: form.get('description') || '',
                      reference: form.get('reference') || '',
                      revenue: Number(form.get('revenue')),
                      ...(form.get('cost') ? { cost: Number(form.get('cost')) } : {}),
                    }),
                  }),
                'Transaction recorded'
              ).then((ok) => {
                if (ok) formEl.reset()
              })
            }}
          >
            <select name="clientId" required className={inputClass}>
              <option value="">Manual entry: clinic…</option>
              {org.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.organizationName}
                </option>
              ))}
            </select>
            <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
            <input name="revenue" type="number" step="0.01" min="0.01" required placeholder="Revenue $" className={`${inputClass} w-28`} />
            {org.compensationModel === 'MARGIN' && (
              <input name="cost" type="number" step="0.01" min="0" placeholder="Cost $ (wholesale)" className={`${inputClass} w-36`} />
            )}
            <input name="description" placeholder="Description" className={inputClass} />
            <input name="reference" placeholder="Reference (dedup)" className={inputClass} />
            <Button type="submit" size="sm" disabled={busy}>
              Record
            </Button>
          </form>

          <CsvImport orgId={id} marginModel={org.compensationModel === 'MARGIN'} onImported={load} />

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Clinic</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4 text-right">Revenue</th>
                  <th className="py-2 pr-4 text-right">Refunded</th>
                  <th className="py-2 text-right">Commission (net)</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground/70">
                      No transactions yet. Captured orders from attributed clinics appear here automatically.
                    </td>
                  </tr>
                )}
                {transactions.map((txn) => {
                  const net = txn.entries.reduce(
                    (sum, entry) => sum + (entry.kind === 'REVERSAL' ? -entry.amountCents : entry.amountCents),
                    0
                  )
                  return (
                    <tr key={txn.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{new Date(txn.transactionDate).toLocaleDateString()}</td>
                      <td className="py-2 pr-4">{txn.client?.organizationName ?? 'Program bonus'}</td>
                      <td className="py-2 pr-4 max-w-[240px] truncate">{txn.description || txn.reference || '—'}</td>
                      <td className="py-2 pr-4">
                        <Badge className="bg-muted/60 text-foreground/80">{txn.source}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-right">{formatCents(txn.revenueCents)}</td>
                      <td className="py-2 pr-4 text-right text-red-400">
                        {txn.refundedCents > 0 ? `−${formatCents(txn.refundedCents)}` : '—'}
                      </td>
                      <td className="py-2 text-right font-medium">{formatCents(net)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Clinics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attributed clinics ({org.clients.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const form = new FormData(e.currentTarget)
              void act(
                () =>
                  fetch(`/api/admin/partners/${id}/clients`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      clientId: form.get('clientId'),
                      repId: form.get('repId') || null,
                    }),
                  }),
                'Clinic attributed'
              )
            }}
          >
            <select name="clientId" required className={inputClass}>
              <option value="">Attach clinic…</option>
              {attachable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.organizationName}
                </option>
              ))}
            </select>
            <select name="repId" className={inputClass}>
              <option value="">No rep</option>
              {org.reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="outline" disabled={busy}>
              Attach
            </Button>
          </form>
          {org.clients.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Clinic</th>
                    <th className="py-2 pr-4">Onboarding</th>
                    <th className="py-2 pr-4">Rep</th>
                    <th className="py-2 pr-4">Since</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {org.clients.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <Link href={`/clients/${c.id}`} className="text-primary hover:underline">
                          {c.organizationName}
                        </Link>
                        <div className="text-xs text-muted-foreground/70">{c.contactEmail}</div>
                      </td>
                      <td className="py-2 pr-4">{c.onboardingStatus}</td>
                      <td className="py-2 pr-4">{repById.get(c.partnerRepId ?? '')?.name || '—'}</td>
                      <td className="py-2 pr-4">{new Date(c.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () =>
                                fetch(`/api/admin/partners/${id}/clients?clientId=${c.id}`, {
                                  method: 'DELETE',
                                }),
                              'Clinic detached'
                            )
                          }
                        >
                          Detach
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Volume bonus tiers (commission model) */}
      {org.compensationModel === 'COMMISSION' && <TiersEditor orgId={id} />}

      {/* Registered leads */}
      {org.leads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registered leads ({org.leads.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Prospect</th>
                    <th className="py-2 pr-4">Match keys</th>
                    <th className="py-2 pr-4">Owner</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Protected until</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {org.leads.map((lead) => (
                    <tr key={lead.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {lead.clinicName}
                        {lead.matchedClient && (
                          <span className="ml-2 text-xs text-emerald-600">
                            → {lead.matchedClient.organizationName}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {[lead.email, lead.npiNumber && `NPI ${lead.npiNumber}`]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                      <td className="py-2 pr-4">{lead.rep?.name || 'Organization'}</td>
                      <td className="py-2 pr-4">
                        <Badge className="bg-slate-100 text-slate-700">{lead.status}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {new Date(lead.protectedUntil).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-right">
                        {(lead.status === 'NEW' || lead.status === 'WORKING') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              const clientId = window.prompt(
                                'Match this lead to a clinic — paste the clinic id (from /clients):'
                              )
                              if (!clientId) return
                              void act(
                                () =>
                                  fetch(`/api/admin/partners/${id}/leads`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ leadId: lead.id, clientId: clientId.trim() }),
                                  }),
                                'Lead matched and clinic attributed'
                              )
                            }}
                          >
                            Match to clinic
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wholesale floors (margin model) */}
      {org.compensationModel === 'MARGIN' && <FloorsEditor orgId={id} />}

      {/* Reps, links, agreements */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reps ({org.reps.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {org.reps.length === 0 ? (
              <p className="text-sm text-muted-foreground/70">The org invites reps from its portal.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {org.reps.map((rep) => (
                  <li key={rep.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span>
                      {rep.name} <span className="text-xs text-muted-foreground/70">({rep.email})</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge className={STATUS_BADGE[rep.status] ?? 'bg-muted/60 text-foreground/80'}>{rep.status}</Badge>
                      <span className="text-xs text-muted-foreground">{formatBps(rep.commissionRateBps)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referral links ({org.referralLinks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {org.referralLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground/70">The org creates links from its portal.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {org.referralLinks.map((link) => (
                  <li key={link.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="min-w-0">
                      <code className="text-xs">{referralUrl(link.code)}</code>
                      {link.label && <span className="ml-2 text-xs text-muted-foreground/70">{link.label}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {link.clickCount} clicks · {link.signupCount} signups {!link.active && '· inactive'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {org.agreements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Executed agreements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {org.agreements.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span>
                    {a.signerName}{' '}
                    <span className="text-xs text-muted-foreground/70">
                      ({a.signerKind === 'ORG' ? 'organization' : 'rep'}) · {a.documentVersion}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{new Date(a.signedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface FloorRow {
  variantId: string
  sku: string | null
  name: string
  dose: string | null
  unitCostCents: number
  srpCents: number
  floorCents: number | null
}

/** Per-variant wholesale floor editor for margin-model orgs. */
function FloorsEditor({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<FloorRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/partners/${orgId}/floors`)
      const data = await res.json()
      if (res.ok) setRows(data.items)
      else toast.error(data.message || 'Failed to load floors')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  async function saveAll() {
    const items = Object.entries(drafts)
      .map(([variantId, value]) => {
        const trimmed = value.trim()
        if (trimmed === '') return { variantId, floorCents: null }
        const dollars = Number(trimmed)
        if (!Number.isFinite(dollars) || dollars < 0) return null
        return { variantId, floorCents: Math.round(dollars * 100) }
      })
      .filter((x): x is { variantId: string; floorCents: number | null } => x !== null)
    if (items.length === 0) {
      toast.error('No changes to save')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/partners/${orgId}/floors`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to save floors')
        return
      }
      toast.success(`Floors saved (${data.updated} set, ${data.cleared} cleared)`)
      setDrafts({})
      void load()
    } finally {
      setSaving(false)
    }
  }

  const usd = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const visible = rows.filter(
    (r) =>
      !filter ||
      r.name.toLowerCase().includes(filter.toLowerCase()) ||
      (r.sku ?? '').toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Wholesale floors (margin model)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter products…"
            className={inputClass}
          />
          <Button size="sm" onClick={() => void saveAll()} disabled={saving || Object.keys(drafts).length === 0}>
            {saving ? 'Saving…' : `Save changes (${Object.keys(drafts).length})`}
          </Button>
          <p className="text-xs text-muted-foreground/70">
            The org prices its clinics at or above the floor and keeps the spread. Products
            without a floor earn the org nothing.
          </p>
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground/70">Loading catalog…</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4 text-right">Our cost</th>
                  <th className="py-2 pr-4 text-right">SRP</th>
                  <th className="py-2 text-right">Floor $</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.variantId} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {row.name} <span className="text-xs text-muted-foreground/70">{row.dose}</span>
                    </td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{usd(row.unitCostCents)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{usd(row.srpCents)}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={drafts[row.variantId] ?? (row.floorCents != null ? (row.floorCents / 100).toFixed(2) : '')}
                        placeholder="—"
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.variantId]: e.target.value }))}
                        className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm text-foreground"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Volume-tier editor: one "threshold,bonus%" pair per line, e.g.
 * "50000, 1" = +1% once quarter-to-date revenue reaches $50,000.
 */
function TiersEditor({ orgId }: { orgId: string }) {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/partners/${orgId}/tiers`)
      .then((r) => (r.ok ? r.json() : { tiers: [] }))
      .then((data) => {
        setText(
          (data.tiers ?? [])
            .map(
              (t: { thresholdCents: number; bonusBps: number }) =>
                `${t.thresholdCents / 100}, ${t.bonusBps / 100}`
            )
            .join('\n')
        )
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [orgId])

  async function save() {
    const tiers = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [threshold, bonus] = line.split(',').map((s) => Number(s.trim()))
        return { threshold, bonusPercent: bonus }
      })
      .filter((t) => Number.isFinite(t.threshold) && Number.isFinite(t.bonusPercent))
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/partners/${orgId}/tiers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.message || 'Failed to save tiers')
        return
      }
      toast.success('Volume tiers saved — applied to future accruals')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Volume bonus tiers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          One tier per line: <code>quarterly revenue $, bonus %</code> — e.g.{' '}
          <code>50000, 1</code> adds +1% to the org rate once quarter-to-date attributed revenue
          reaches $50,000. Highest reached tier wins; partners see their ladder on the Terms page.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={'50000, 1\n150000, 2.5'}
          className="w-full rounded-md border px-3 py-2 font-mono text-xs"
        />
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save tiers'}
        </Button>
      </CardContent>
    </Card>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'emerald' }) {
  const toneClass = tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-foreground'
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function CsvImport({
  orgId,
  marginModel,
  onImported,
}: {
  orgId: string
  marginModel: boolean
  onImported: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleImport() {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const rows: Array<Record<string, unknown>> = []
    for (const line of lines) {
      const [email, date, revenue, cost, reference, ...desc] = line.split(',').map((s) => s.trim())
      if (!email || !date || !revenue) continue
      rows.push({
        clientEmail: email,
        date,
        revenue: Number(revenue),
        ...(cost ? { cost: Number(cost) } : {}),
        ...(reference ? { reference } : {}),
        ...(desc.length ? { description: desc.join(', ') } : {}),
      })
    }
    if (rows.length === 0) {
      toast.error('No valid rows found')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/partners/${orgId}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Import failed')
        return
      }
      toast.success(
        `Imported ${data.imported}, skipped ${data.skipped} duplicates${data.failures?.length ? `, ${data.failures.length} failed` : ''}`
      )
      setText('')
      setOpen(false)
      await onImported()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Import CSV…
      </Button>
    )
  }
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="mb-2 text-xs text-muted-foreground">
        One row per line: <code>clinicEmail, date (YYYY-MM-DD), revenue{marginModel ? ', cost' : ', '} , reference, description</code>.
        Rows with an existing reference are skipped (safe to re-import).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
        placeholder={`clinic@example.com, 2026-07-01, 1250.00${marginModel ? ', 900.00' : ','}, INV-1001, July order`}
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => void handleImport()} disabled={busy}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
