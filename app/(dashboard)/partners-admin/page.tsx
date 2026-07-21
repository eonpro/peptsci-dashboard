'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Handshake, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatCents, formatBps } from '@/lib/partners/commission'

interface OrgRow {
  id: string
  name: string
  contactName: string | null
  contactEmail: string
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'
  compensationModel: 'COMMISSION' | 'MARGIN'
  commissionRateBps: number
  hasLogin: boolean
  createdAt: string
  repCount: number
  clientCount: number
  linkCount: number
  revenueCents: number
  unpaidCents: number
  paidCents: number
}

const STATUS_BADGE: Record<OrgRow['status'], string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 border border-amber-400/30',
  ACTIVE: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30',
  SUSPENDED: 'bg-red-500/15 text-red-300 border border-red-400/30',
}

export default function PartnersAdminPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/partners')
      const data = await res.json()
      if (res.ok) setOrgs(data.orgs)
      else toast.error(data.message || 'Failed to load partners')
    } catch {
      toast.error('Failed to load partners')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.get('name'),
          contactName: form.get('contactName') || '',
          contactEmail: form.get('contactEmail'),
          contactPhone: form.get('contactPhone') || '',
          compensationModel: form.get('compensationModel') || 'COMMISSION',
          commissionRateBps: Math.round(Number(form.get('ratePercent') || 0) * 100),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.message || 'Failed to create partner org')
        return
      }
      toast.success('Partner org created')
      setShowCreate(false)
      void load()
    } finally {
      setCreating(false)
    }
  }

  const pending = orgs.filter((o) => o.status === 'PENDING')
  const rest = orgs.filter((o) => o.status !== 'PENDING')

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Handshake className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">Partners</h1>
            <p className="text-sm text-muted-foreground">
              Affiliate sales organizations, reps, commissions, and payouts.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/partners-admin/assets"
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
          >
            Marketing assets
          </Link>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" /> New Partner Org
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input name="name" required placeholder="Organization name *" className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
              <input name="contactName" placeholder="Contact name" className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
              <input name="contactEmail" type="email" required placeholder="Contact email *" className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
              <input name="contactPhone" placeholder="Phone" className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
              <select name="compensationModel" className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
                <option value="COMMISSION">Commission (% of revenue)</option>
                <option value="MARGIN">Margin (price above floor)</option>
              </select>
              <input
                name="ratePercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="Commission rate % (commission model)"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? 'Creating…' : 'Create org'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {pending.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-300">
            Pending applications ({pending.length})
          </h2>
          <OrgTable orgs={pending} />
        </div>
      )}

      <PayoutQueue />

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Partner organizations
        </h2>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground/70">Loading…</p>
        ) : rest.length === 0 && pending.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No partner orgs yet. Share the application link:{' '}
              <code className="rounded bg-muted/60 px-1.5 py-0.5 text-foreground/80">/partners/apply</code>
            </CardContent>
          </Card>
        ) : (
          <OrgTable orgs={rest} />
        )}
      </div>
    </div>
  )
}

interface QueueRow {
  orgId: string
  orgName: string
  payee: 'ORG' | 'REP'
  repName: string | null
  amountCents: number
  w9OnFile: boolean
  minimumCents: number
  hasOpenRequest: boolean
}

/** All approved (payable) balances across the program, biggest first. */
function PayoutQueue() {
  const [queue, setQueue] = useState<QueueRow[] | null>(null)

  useEffect(() => {
    fetch('/api/admin/partners/payout-queue')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setQueue(data?.queue ?? []))
      .catch(() => setQueue([]))
  }, [])

  if (!queue || queue.length === 0) return null

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Payout queue ({queue.length})
        </h2>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- CSV download route */}
        <a
          href={`/api/admin/partners/tax-report?year=${new Date().getFullYear()}`}
          className="text-xs text-blue-700 hover:underline"
          title="Payout totals per payee with W-9 status — for 1099 filing"
        >
          1099 export (CSV, {new Date().getFullYear()})
        </a>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Payee</th>
                <th className="px-4 py-3 text-right">Approved balance</th>
                <th className="px-4 py-3">W-9</th>
                <th className="px-4 py-3">Requested?</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={`${row.orgId}:${row.payee}:${row.repName ?? ''}`} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">{row.orgName}</span>
                    {row.repName && <span className="text-slate-500"> — rep {row.repName}</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCents(row.amountCents)}</td>
                  <td className="px-4 py-3">
                    {row.w9OnFile ? (
                      <Badge className="bg-emerald-100 text-emerald-800">On file</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800">Missing</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.hasOpenRequest ? (
                      <Badge className="bg-blue-100 text-blue-800">Requested</Badge>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/partners-admin/${row.orgId}`}
                      className="text-sm text-blue-700 hover:underline"
                    >
                      Record payout
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function OrgTable({ orgs }: { orgs: OrgRow[] }) {
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3 text-right">Clinics</th>
              <th className="px-4 py-3 text-right">Reps</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">Unpaid</th>
              <th className="px-4 py-3 text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link href={`/partners-admin/${org.id}`} className="font-medium text-primary hover:underline">
                    {org.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{org.contactEmail}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge className={STATUS_BADGE[org.status]}>{org.status}</Badge>
                  {!org.hasLogin && org.status === 'ACTIVE' && (
                    <div className="mt-1 text-[11px] text-amber-400">Invite pending</div>
                  )}
                </td>
                <td className="px-4 py-3">{org.compensationModel === 'MARGIN' ? 'Margin' : 'Commission'}</td>
                <td className="px-4 py-3">
                  {org.compensationModel === 'MARGIN' ? '—' : formatBps(org.commissionRateBps)}
                </td>
                <td className="px-4 py-3 text-right">{org.clientCount}</td>
                <td className="px-4 py-3 text-right">{org.repCount}</td>
                <td className="px-4 py-3 text-right">{formatCents(org.revenueCents)}</td>
                <td className="px-4 py-3 text-right font-medium text-amber-300">
                  {formatCents(org.unpaidCents)}
                </td>
                <td className="px-4 py-3 text-right text-emerald-300">{formatCents(org.paidCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
