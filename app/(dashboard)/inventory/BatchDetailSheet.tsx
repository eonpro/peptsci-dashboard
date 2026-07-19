'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, FileText, History, Loader2, Package, Printer, Trash2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  type BatchRow,
  type BatchEventRow,
  EVENT_LABELS,
  SHEET_MAX,
  budLabel,
  budTone,
  fmtDate,
  fmtDateTime,
} from './inventory-shared'

interface BatchDetail extends BatchRow {
  notes: string | null
  receivedByName: string | null
  events: BatchEventRow[]
}

interface BatchDetailSheetProps {
  batchId: string | null
  onOpenChange: (open: boolean) => void
  /** Refetch the workspace after a mutation (void, print). */
  onChanged: () => void
}

const statusVariant = (status: BatchRow['status']) =>
  status === 'VOIDED' ? 'destructive' : status === 'DEPLETED' ? 'secondary' : 'default'

export default function BatchDetailSheet({
  batchId,
  onOpenChange,
  onChanged,
}: BatchDetailSheetProps) {
  const [detail, setDetail] = useState<BatchDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [printQty, setPrintQty] = useState(String(SHEET_MAX))
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  const load = useCallback(async () => {
    if (!batchId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/inventory/batches/${batchId}?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('Failed to load batch')
      const data = await res.json()
      setDetail(data.batch)
    } catch {
      toast.error('Could not load batch details')
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }, [batchId, onOpenChange])

  useEffect(() => {
    setDetail(null)
    if (batchId) void load()
  }, [batchId, load])

  async function downloadLabels(opts: { proofMode?: boolean; quantity?: number }) {
    if (!detail) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/inventory/labels/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: detail.id, ...opts }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to generate labels')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `peptsci-labels-${detail.batchNumber}${opts.proofMode ? '-proof' : ''}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success(opts.proofMode ? 'Proof label downloaded' : 'Label sheet downloaded')
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate labels')
    } finally {
      setBusy(false)
    }
  }

  async function confirmVoid() {
    if (!detail) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/admin/inventory/batches/${detail.id}?reason=${encodeURIComponent(voidReason || 'Voided')}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to void batch')
      toast.success(`Batch ${detail.batchNumber} voided`)
      setVoidOpen(false)
      setVoidReason('')
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to void batch')
    } finally {
      setBusy(false)
    }
  }

  const tone = detail ? budTone(detail.bud) : 'ok'
  const usedPct =
    detail && detail.qtyReceived > 0
      ? Math.round((detail.qtyOnHand / (detail.qtyReceived - detail.qtyDamaged || 1)) * 100)
      : 0

  return (
    <Sheet open={batchId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        {loading || !detail ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b p-6 pb-4">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="font-mono text-lg">{detail.batchNumber}</SheetTitle>
                <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
              </div>
              <SheetDescription>
                {detail.productName} · {detail.dose}
                {detail.vialSize ? ` · ${detail.vialSize}` : ''} · {detail.purity}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-6">
              {/* Stock gauge */}
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Package className="h-4 w-4 text-muted-foreground" /> On hand
                  </span>
                  <span>
                    <span className="text-lg font-bold">{detail.qtyOnHand}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      / {detail.qtyReceived - detail.qtyDamaged} usable
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      detail.status === 'VOIDED'
                        ? 'bg-red-300'
                        : usedPct <= 20
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, usedPct))}%` }}
                  />
                </div>
                {detail.qtyDamaged > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {detail.qtyDamaged} damaged at intake (excluded)
                  </p>
                )}
              </div>

              {/* Key facts */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="text-muted-foreground">Beyond-use date</span>
                <span
                  className={`text-right font-medium ${
                    tone === 'expired'
                      ? 'text-red-600 dark:text-red-400'
                      : tone === 'soon'
                        ? 'text-amber-600 dark:text-amber-400'
                        : ''
                  }`}
                >
                  {fmtDate(detail.bud)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({budLabel(detail.bud)})
                  </span>
                </span>
                <span className="text-muted-foreground">Received</span>
                <span className="text-right">{fmtDate(detail.receivedOn)}</span>
                <span className="text-muted-foreground">Received by</span>
                <span className="truncate text-right">{detail.receivedByName || '—'}</span>
                <span className="text-muted-foreground">SKU</span>
                <span className="text-right font-mono text-xs">{detail.variant?.sku || '—'}</span>
              </div>

              {detail.notes && (
                <div className="rounded-lg bg-muted/60 p-3 text-sm">
                  <p className="mb-0.5 text-xs font-medium uppercase text-muted-foreground">
                    Notes
                  </p>
                  {detail.notes}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy || detail.status === 'VOIDED'}
                  onClick={() => {
                    setPrintQty(
                      String(Math.min(SHEET_MAX, Math.max(1, detail.qtyOnHand || SHEET_MAX)))
                    )
                    setPrintOpen(true)
                  }}
                >
                  <Printer className="mr-1.5 h-4 w-4" /> Print labels
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => downloadLabels({ proofMode: true })}
                >
                  <FileText className="mr-1.5 h-4 w-4" /> Proof
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300"
                  disabled={busy || detail.status === 'VOIDED'}
                  onClick={() => setVoidOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> Void
                </Button>
              </div>

              <Separator />

              {/* Timeline */}
              <div>
                <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                  <History className="h-4 w-4 text-muted-foreground" /> History
                </p>
                <ol className="space-y-3">
                  {detail.events.length === 0 && (
                    <p className="text-sm text-muted-foreground">No events recorded.</p>
                  )}
                  {[...detail.events].reverse().map((ev) => (
                    <li key={ev.id} className="relative pl-4">
                      <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                      <p className="text-sm font-medium">
                        {EVENT_LABELS[ev.type] ?? ev.type}
                        {ev.delta !== null && ev.delta !== 0 && (
                          <span
                            className={`ml-1.5 text-xs font-semibold ${ev.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                          >
                            {ev.delta > 0 ? `+${ev.delta}` : ev.delta}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDateTime(ev.createdAt)}
                        {ev.performedBy ? ` · ${ev.performedBy}` : ''}
                      </p>
                      {ev.note && (
                        <p className="mt-0.5 text-xs italic text-muted-foreground">{ev.note}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* Print quantity dialog */}
            <Dialog open={printOpen} onOpenChange={setPrintOpen}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Print labels</DialogTitle>
                  <DialogDescription>
                    Batch {detail.batchNumber}. A full sheet holds {SHEET_MAX} labels.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="print-qty">Number of labels</Label>
                  <Input
                    id="print-qty"
                    type="number"
                    min={1}
                    max={SHEET_MAX}
                    value={printQty}
                    onChange={(e) => setPrintQty(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPrintOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      const qty = Math.min(
                        SHEET_MAX,
                        Math.max(1, Math.trunc(Number(printQty) || SHEET_MAX))
                      )
                      setPrintOpen(false)
                      void downloadLabels({ quantity: qty })
                    }}
                  >
                    {busy ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Printer className="mr-1.5 h-4 w-4" />
                    )}
                    Download PDF
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Void dialog */}
            <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Void batch {detail.batchNumber}?</DialogTitle>
                  <DialogDescription>
                    Removes the remaining {detail.qtyOnHand} vials from stock. This cannot be
                    undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="void-reason">Reason</Label>
                  <Textarea
                    id="void-reason"
                    placeholder="e.g. Failed QC, recalled, mislabeled…"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setVoidOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={busy || voidReason.trim().length === 0}
                    onClick={confirmVoid}
                  >
                    {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Void batch
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
        {detail && (
          <p className="mt-auto flex items-center gap-1.5 border-t p-4 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" /> Labels draw down stock when printed through
            order fulfillment; manual sheets here are audit-logged without consuming stock.
          </p>
        )}
      </SheetContent>
    </Sheet>
  )
}
