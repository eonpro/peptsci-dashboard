'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RotateCcw, Loader2, Plus, PackageX, Search } from 'lucide-react'

type ReturnRow = {
  id: string
  rmaNumber: string
  status: string
  createdAt: string
  order: { orderNumber: number } | null
  client: { organizationName: string } | null
  items: { id: string; quantity: number }[]
}

const STATUS_TABS = ['ALL', 'REQUESTED', 'APPROVED', 'RECEIVED', 'RESTOCKED', 'CLOSED'] as const

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  APPROVED: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  REJECTED: 'bg-red-500/15 text-red-300 border-red-500/30',
  LABEL_SENT: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  IN_TRANSIT: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  RECEIVED: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  INSPECTED: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  RESTOCKED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  REFUNDED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  CLOSED: 'bg-white/10 text-white/60 border-white/20',
}

type LookupItem = {
  orderItemId: string
  variantId: string | null
  productName: string
  quantityOrdered: number
}

type SelectedItem = LookupItem & { selected: boolean; quantity: number; condition: string }

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>('ALL')
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (status !== 'ALL') qs.set('status', status)
    fetch(`/api/admin/returns?${qs.toString()}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to load returns')
        return data
      })
      .then((data) => setReturns(data.data?.returns ?? data.returns ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load returns'))
      .finally(() => setLoading(false))
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <RotateCcw className="h-6 w-6" /> Returns
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Open RMAs against orders, advance them through the workflow, and restock received items.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Return
        </Button>
      </div>

      <div className="flex gap-1 rounded-lg border border-white/10 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatus(tab)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              status === tab ? 'bg-[#213cef] text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Return requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-white/60">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="py-8 text-center text-red-400">{error}</p>
          ) : returns.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-white/50">
              <PackageX className="mb-3 h-10 w-10" />
              No returns found.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {returns.map((r) => (
                <Link
                  key={r.id}
                  href={`/returns/${r.id}`}
                  className="flex items-center justify-between gap-3 py-4 transition-colors hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-white">{r.rmaNumber}</span>
                      <Badge variant="outline" className={`text-xs ${STATUS_STYLES[r.status] ?? ''}`}>
                        {r.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-white/60">
                      {r.order ? `Order #${r.order.orderNumber}` : 'Order'} ·{' '}
                      {r.client?.organizationName || 'Unknown client'} · {r.items.length} item(s) ·{' '}
                      {formatDate(r.createdAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NewReturnDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false)
          load()
        }}
      />
    </div>
  )
}

function NewReturnDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [orderQuery, setOrderQuery] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [orderNumber, setOrderNumber] = useState<number | null>(null)
  const [items, setItems] = useState<SelectedItem[]>([])
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const reset = () => {
    setOrderQuery('')
    setOrderId(null)
    setOrderNumber(null)
    setItems([])
    setReason('')
    setLookupError(null)
    setSubmitError(null)
  }

  const lookup = () => {
    if (!orderQuery.trim()) return
    setLookupLoading(true)
    setLookupError(null)
    fetch(`/api/admin/returns/order-lookup?orderNumber=${encodeURIComponent(orderQuery.trim())}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Order not found')
        return data.data ?? data
      })
      .then((order) => {
        setOrderId(order.id)
        setOrderNumber(order.orderNumber)
        setItems(
          (order.items as LookupItem[]).map((it) => ({
            ...it,
            selected: true,
            quantity: it.quantityOrdered,
            condition: 'GOOD',
          }))
        )
      })
      .catch((e) => {
        setLookupError(e instanceof Error ? e.message : 'Order not found')
        setOrderId(null)
        setItems([])
      })
      .finally(() => setLookupLoading(false))
  }

  const submit = () => {
    if (!orderId) return
    const chosen = items.filter((i) => i.selected && i.quantity > 0)
    if (chosen.length === 0) {
      setSubmitError('Select at least one item')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    fetch('/api/admin/returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        reason: reason.trim() || undefined,
        items: chosen.map((i) => ({
          orderItemId: i.orderItemId,
          variantId: i.variantId ?? undefined,
          productName: i.productName,
          quantity: i.quantity,
          condition: i.condition,
        })),
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.message || data.error || 'Failed to create return')
        return data
      })
      .then(() => {
        reset()
        onCreated()
      })
      .catch((e) => setSubmitError(e instanceof Error ? e.message : 'Failed to create return'))
      .finally(() => setSubmitting(false))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New return</DialogTitle>
          <DialogDescription>Find an order, then choose the items being returned.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-white/60">Order number</label>
              <Input
                placeholder="e.g. 1042"
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookup()}
              />
            </div>
            <Button variant="outline" onClick={lookup} disabled={lookupLoading}>
              {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {lookupError && <p className="text-sm text-red-400">{lookupError}</p>}

          {orderId && (
            <>
              <p className="text-sm text-white/70">
                Order <span className="font-semibold text-white">#{orderNumber}</span> — select items:
              </p>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {items.length === 0 && <p className="text-sm text-white/50">This order has no line items.</p>}
                {items.map((item, idx) => (
                  <div
                    key={item.orderItemId}
                    className="flex items-center gap-2 rounded-md border border-white/10 p-2"
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, selected: e.target.checked } : p))
                        )
                      }
                      className="h-4 w-4 accent-[#213cef]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{item.productName}</p>
                      <p className="text-xs text-white/40">Ordered: {item.quantityOrdered}</p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={item.quantityOrdered}
                      value={item.quantity}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, quantity: Math.max(1, Number(e.target.value) || 1) } : p
                          )
                        )
                      }
                      className="w-16"
                    />
                    <Select
                      value={item.condition}
                      onValueChange={(v) =>
                        setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, condition: v } : p)))
                      }
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GOOD">Good</SelectItem>
                        <SelectItem value="DAMAGED">Damaged</SelectItem>
                        <SelectItem value="MISSING">Missing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Reason (optional)</label>
                <Input
                  placeholder="e.g. Damaged in transit"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </>
          )}

          {submitError && <p className="text-sm text-red-400">{submitError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!orderId || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
