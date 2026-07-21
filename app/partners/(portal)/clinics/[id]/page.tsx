'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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

  if (loading && !data)
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    )
  if (!data) return <p className="py-10 text-center text-sm text-slate-400">Clinic not found.</p>

  const { clinic } = data

  return (
    <div className="space-y-6">
      <div>
        <Link href="/partners/clinics" className="mb-1 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> All clinics
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {clinic.organizationName}
        </h1>
        <p className="text-sm text-slate-500">
          Joined {new Date(clinic.createdAt).toLocaleDateString()}
          {clinic.partnerRep && ` · Rep: ${clinic.partnerRep.name}`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details sidebar */}
        <Card className="h-fit lg:col-span-1">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="clinic-stage" className="text-xs font-medium text-slate-500">
                Stage
              </Label>
              <Select
                value={data.stage}
                disabled={busy}
                onValueChange={(value) => void patch({ stage: value }, 'Stage updated')}
              >
                <SelectTrigger id="clinic-stage" className="mt-1 h-9 w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="clinic-tags" className="text-xs font-medium text-slate-500">
                Tags (comma-separated)
              </Label>
              <Input
                id="clinic-tags"
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
                className="mt-1 w-full bg-white"
              />
            </div>
            <dl className="space-y-2 border-t border-slate-100 pt-4 text-sm">
              {clinic.contactName && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Contact</dt>
                  <dd className="text-right font-medium text-slate-700">{clinic.contactName}</dd>
                </div>
              )}
              {clinic.contactEmail && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Email</dt>
                  <dd className="truncate text-right text-slate-700">{clinic.contactEmail}</dd>
                </div>
              )}
              {clinic.contactPhone && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Phone</dt>
                  <dd className="text-right text-slate-700">{clinic.contactPhone}</dd>
                </div>
              )}
              {clinic.partnerRep && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Rep</dt>
                  <dd className="text-right text-slate-700">{clinic.partnerRep.name}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Joined</dt>
                <dd className="text-right text-slate-700">
                  {new Date(clinic.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Activity + transactions */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!note.trim()) return
                  void patch({ note: note.trim() }, 'Note added').then(() => setNote(''))
                }}
                className="mb-4 flex gap-2"
              >
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="Add a note…"
                  aria-label="Note"
                  className="flex-1 bg-white"
                />
                <Button type="submit" disabled={busy || !note.trim()} className="font-semibold">
                  Add
                </Button>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.transactions.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No transactions yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-auto py-2 pl-0 pr-4 text-xs uppercase">Date</TableHead>
                        <TableHead className="h-auto py-2 pl-0 pr-4 text-xs uppercase">Description</TableHead>
                        <TableHead className="h-auto py-2 pl-0 pr-0 text-right text-xs uppercase">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.transactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="py-2 pl-0 pr-4 text-slate-500">
                            {new Date(t.transactionDate).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate py-2 pl-0 pr-4 text-slate-500">
                            {t.description || '—'}
                          </TableCell>
                          <TableCell className="py-2 pl-0 pr-0 text-right tabular-nums">
                            {usd(t.revenueCents)}
                            {t.refundedCents > 0 && (
                              <span className="ml-1 text-xs text-red-500">(−{usd(t.refundedCents)})</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
