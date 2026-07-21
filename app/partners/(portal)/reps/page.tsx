'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '../_components/PageHeader'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
  const [joinUrl, setJoinUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/partners/team-join')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setJoinUrl(data?.url ?? null))
      .catch(() => {})
  }, [])
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
    <div className="space-y-6">
      <PageHeader
        title="Sales reps"
        description={
          <>
            Invite reps, set their commission carve-out (out of your org rate
            {orgRateBps > 0 ? ` of ${orgRateBps / 100}%` : ''}), and track their book.
          </>
        }
      />

      {joinUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <span className="font-medium text-emerald-800">Team join link:</span>
          <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-xs">{joinUrl}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(joinUrl)
              toast.success('Join link copied — reps apply, you approve')
            }}
            className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          >
            Copy
          </button>
          <p className="basis-full text-xs text-emerald-700/70">
            Share this anywhere — reps apply themselves and appear below for your approval.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
      <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
        <UserPlus className="mb-2 h-4 w-4 text-slate-400" />
        <Input name="name" required placeholder="Full name *" aria-label="Full name" className="w-auto bg-white" />
        <Input name="email" type="email" required placeholder="Email *" aria-label="Email" className="w-auto bg-white" />
        <Input name="phone" placeholder="Phone" aria-label="Phone" className="w-32 bg-white" />
        <Input
          name="ratePercent"
          type="number"
          step="0.01"
          min="0"
          max="100"
          required
          placeholder="Rate %"
          aria-label="Rate percent"
          className="w-24 bg-white"
        />
        <Button type="submit" disabled={inviting} className="font-semibold">
          {inviting ? 'Inviting…' : 'Invite rep'}
        </Button>
      </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="text-xs uppercase tracking-wide">Rep</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Rate</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Clinics</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Revenue</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Earned</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Unpaid</TableHead>
              <TableHead className="text-xs uppercase tracking-wide" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8} className="py-3">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && reps.length === 0 && (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState
                    icon={UserPlus}
                    title="No reps yet"
                    description="Invite your first rep above."
                    className="py-6"
                  />
                </TableCell>
              </TableRow>
            )}
            {reps.map((rep) => (
              <TableRow key={rep.id}>
                <TableCell className="py-3">
                  <div className="font-medium">{rep.name}</div>
                  <div className="text-xs text-slate-400">{rep.email}</div>
                </TableCell>
                <TableCell className="py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-medium',
                      rep.status === 'ACTIVE'
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                        : rep.status === 'PENDING'
                          ? 'border-amber-200 bg-amber-100 text-amber-700'
                          : 'border-red-200 bg-red-100 text-red-600'
                    )}
                  >
                    {rep.status === 'PENDING' ? 'Invite sent' : rep.status}
                  </Badge>
                </TableCell>
                <TableCell className="py-3">
                  <Button
                    variant="link"
                    className="h-auto p-0 text-sm font-normal"
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
                  </Button>
                </TableCell>
                <TableCell className="py-3 text-right">{rep.clinicCount}</TableCell>
                <TableCell className="py-3 text-right">{usd(rep.revenueCents)}</TableCell>
                <TableCell className="py-3 text-right">{usd(rep.earnedCents)}</TableCell>
                <TableCell className="py-3 text-right text-amber-600">{usd(rep.unpaidCents)}</TableCell>
                <TableCell className="py-3 text-right">
                  {rep.status === 'PENDING' && !rep.hasLogin ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-sm font-medium text-emerald-600 hover:bg-transparent hover:underline"
                      onClick={() => {
                        const rate = window.prompt(
                          `Approve ${rep.name} — commission rate % (max ${orgRateBps / 100}%):`,
                          String(rep.commissionRateBps / 100)
                        )
                        if (rate === null) return
                        const value = Number(rate)
                        if (!Number.isFinite(value) || value < 0) {
                          toast.error('Enter a valid rate')
                          return
                        }
                        void (async () => {
                          const res = await fetch('/api/partners/reps', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ repId: rep.id, action: 'approve', ratePercent: value }),
                          })
                          const data = await res.json().catch(() => ({}))
                          if (!res.ok) {
                            toast.error(data.message || 'Approval failed')
                            return
                          }
                          toast.success('Rep approved — sign-up invitation sent')
                          void load()
                        })()
                      }}
                    >
                      Approve &amp; invite
                    </Button>
                  ) : rep.status !== 'PENDING' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-sm font-normal text-slate-500 hover:bg-transparent hover:underline"
                      onClick={() =>
                        void update(rep.id, { status: rep.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })
                      }
                    >
                      {rep.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </Card>

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
              <Label htmlFor="rep-rate" className="sr-only">
                Commission rate percent
              </Label>
              <Input
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
                className="w-28 bg-white"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRateEdit(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingRate} className="font-semibold">
                {savingRate ? 'Saving…' : 'Save rate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
