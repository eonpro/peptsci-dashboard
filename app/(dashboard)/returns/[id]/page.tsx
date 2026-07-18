'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Loader2, PackageCheck, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { nextStatuses, type ReturnStatus } from '@/lib/returns/core'

type DetailItem = {
  id: string
  productName: string
  quantity: number
  condition: string
  restocked: boolean
  variantId: string | null
}

type ReturnDetail = {
  id: string
  rmaNumber: string
  status: ReturnStatus
  reason: string | null
  notes: string | null
  refundAmount: string | number | null
  createdAt: string
  approvedAt: string | null
  receivedAt: string | null
  closedAt: string | null
  items: DetailItem[]
  order: { id: string; orderNumber: number } | null
  client: { id: string; organizationName: string; contactEmail: string | null } | null
}

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  APPROVED: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  REJECTED: 'bg-red-500/15 text-red-300 border-red-500/30',
  RECEIVED: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  INSPECTED: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  RESTOCKED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  REFUNDED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  CLOSED: 'bg-white/10 text-white/60 border-white/20',
}

export default function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<ReturnDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nextStatus, setNextStatus] = useState<string>('')
  const [refund, setRefund] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/admin/returns/${id}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.message || body.error || 'Failed to load return')
        return body as ReturnDetail
      })
      .then((d) => {
        setData(d)
        setNextStatus('')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load return'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const applyStatus = () => {
    if (!nextStatus) return
    // REFUNDED needs a real dollar amount — block the no-op "Apply with empty $".
    if (nextStatus === 'REFUNDED') {
      const amount = Number(refund)
      if (!refund.trim() || !Number.isFinite(amount) || amount <= 0) {
        setActionError('Enter the refund amount before marking as refunded.')
        return
      }
    }
    setBusy(true)
    setActionError(null)
    fetch(`/api/admin/returns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: nextStatus,
        ...(nextStatus === 'REFUNDED' && refund ? { refundAmount: Number(refund) } : {}),
      }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.message || body.error || 'Failed to update status')
      })
      .then(() => {
        toast.success(`Return moved to ${nextStatus}`)
        load()
      })
      .catch((e) => setActionError(e instanceof Error ? e.message : 'Failed to update status'))
      .finally(() => setBusy(false))
  }

  const restock = () => {
    setBusy(true)
    setActionError(null)
    fetch(`/api/admin/returns/${id}/restock`, { method: 'POST' })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.message || body.error || 'Failed to restock')
      })
      .then(() => {
        toast.success('Items restocked')
        load()
      })
      .catch((e) => setActionError(e instanceof Error ? e.message : 'Failed to restock'))
      .finally(() => setBusy(false))
  }

  const fmt = (s: string | null) =>
    s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/returns" className="inline-flex items-center text-sm text-white/60 hover:text-white">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to returns
        </Link>
        <p className="text-red-400">{error ?? 'Return not found'}</p>
      </div>
    )
  }

  const options = nextStatuses(data.status)
  const canRestock =
    (data.status === 'RECEIVED' || data.status === 'INSPECTED') &&
    data.items.some((i) => i.condition === 'GOOD' && !i.restocked && i.variantId)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/returns" className="inline-flex items-center text-sm text-white/60 hover:text-white">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to returns
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <RotateCcw className="h-6 w-6" />
            <span className="font-mono">{data.rmaNumber}</span>
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {data.order ? (
              <Link
                href={`/fulfillment?search=${data.order.orderNumber}`}
                className="hover:underline"
              >
                Order #{data.order.orderNumber}
              </Link>
            ) : (
              'Order'
            )}{' '}
            · {data.client?.organizationName || 'Unknown client'}
          </p>
        </div>
        <Badge variant="outline" className={STATUS_STYLES[data.status] ?? ''}>
          {data.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-white/5">
          {data.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-white">{item.productName}</p>
                <p className="text-xs text-white/40">
                  Qty {item.quantity} · {item.condition}
                  {!item.variantId && ' · no variant link'}
                </p>
              </div>
              {item.restocked ? (
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                  <PackageCheck className="mr-1 h-3 w-3" /> Restocked
                </Badge>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.reason && (
            <p className="text-sm text-white/70">
              <span className="text-white/40">Reason:</span> {data.reason}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-white/40">Opened</dt>
            <dd className="text-white/80">{fmt(data.createdAt)}</dd>
            <dt className="text-white/40">Approved</dt>
            <dd className="text-white/80">{fmt(data.approvedAt)}</dd>
            <dt className="text-white/40">Received</dt>
            <dd className="text-white/80">{fmt(data.receivedAt)}</dd>
            <dt className="text-white/40">Closed</dt>
            <dd className="text-white/80">{fmt(data.closedAt)}</dd>
            {data.refundAmount != null && (
              <>
                <dt className="text-white/40">Refund</dt>
                <dd className="text-white/80">${Number(data.refundAmount).toFixed(2)}</dd>
              </>
            )}
          </dl>

          {actionError && <p className="text-sm text-red-400">{actionError}</p>}

          <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-4">
            {options.length > 0 ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white/60">Advance to</label>
                  <Select value={nextStatus} onValueChange={setNextStatus}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Select status…" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {nextStatus === 'REFUNDED' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-white/60">Refund $</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={refund}
                      onChange={(e) => setRefund(e.target.value)}
                      className="w-28"
                    />
                  </div>
                )}
                <Button onClick={applyStatus} disabled={!nextStatus || busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Apply
                </Button>
              </>
            ) : (
              <p className="text-sm text-white/50">This return is closed.</p>
            )}

            {canRestock && (
              <Button variant="outline" onClick={restock} disabled={busy}>
                <PackageCheck className="mr-2 h-4 w-4" /> Restock items
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
