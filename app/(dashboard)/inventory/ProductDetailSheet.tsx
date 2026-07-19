'use client'

import { useCallback, useEffect, useState } from 'react'
import { Boxes, History, Loader2, Pencil, PlusCircle } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  type AdjustmentRow,
  type BatchRow,
  type ProductRollupRow,
  REASON_LABELS,
  budLabel,
  budTone,
  fmtDate,
  fmtDateTime,
  isLowStock,
} from './inventory-shared'

interface ProductDetailSheetProps {
  row: ProductRollupRow | null
  onOpenChange: (open: boolean) => void
  onChanged: () => void
  onOpenBatch: (batchId: string) => void
}

const ADJUST_REASONS = [
  { value: 'MANUAL_ADJUSTMENT', label: 'Count correction' },
  { value: 'DAMAGE', label: 'Damage write-off' },
  { value: 'AUDIT', label: 'Audit true-up' },
  { value: 'RETURN', label: 'Return restock' },
] as const

export default function ProductDetailSheet({
  row,
  onOpenChange,
  onChanged,
  onOpenBatch,
}: ProductDetailSheetProps) {
  const [batches, setBatches] = useState<BatchRow[] | null>(null)
  const [movements, setMovements] = useState<AdjustmentRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  // Adjust-stock dialog
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustDir, setAdjustDir] = useState<'add' | 'remove'>('add')
  const [adjustQty, setAdjustQty] = useState('1')
  const [adjustReason, setAdjustReason] = useState<string>('MANUAL_ADJUSTMENT')
  const [adjustNote, setAdjustNote] = useState('')

  // Reorder-level inline editor
  const [editingReorder, setEditingReorder] = useState(false)
  const [reorderValue, setReorderValue] = useState('')

  const variantId = row?.variantId ?? null

  const load = useCallback(async () => {
    if (!variantId) return
    try {
      const [batchRes, adjRes] = await Promise.all([
        fetch(`/api/admin/inventory/batches?status=ALL&variantId=${variantId}&t=${Date.now()}`, {
          cache: 'no-store',
        }),
        fetch(`/api/admin/inventory/adjustments?variantId=${variantId}&take=50&t=${Date.now()}`, {
          cache: 'no-store',
        }),
      ])
      if (batchRes.ok) setBatches((await batchRes.json()).batches ?? [])
      if (adjRes.ok) setMovements((await adjRes.json()).adjustments ?? [])
    } catch {
      toast.error('Could not load product stock details')
    }
  }, [variantId])

  useEffect(() => {
    setBatches(null)
    setMovements(null)
    setEditingReorder(false)
    if (variantId) void load()
  }, [variantId, load])

  async function submitAdjustment() {
    if (!row) return
    const qty = Math.max(1, Math.trunc(Number(adjustQty) || 0))
    const delta = adjustDir === 'add' ? qty : -qty
    setBusy(true)
    try {
      const res = await fetch('/api/admin/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: row.variantId,
          delta,
          reason: adjustReason,
          note: adjustNote.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to record adjustment')
      }
      toast.success(`Stock ${delta > 0 ? 'increased' : 'reduced'} by ${qty}`)
      setAdjustOpen(false)
      setAdjustQty('1')
      setAdjustNote('')
      await load()
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record adjustment')
    } finally {
      setBusy(false)
    }
  }

  async function saveReorderLevel() {
    if (!row) return
    const level = Math.max(0, Math.trunc(Number(reorderValue) || 0))
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/inventory/variants/${row.variantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderLevel: level }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to update reorder level')
      }
      toast.success(`Reorder level set to ${level}`)
      setEditingReorder(false)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update reorder level')
    } finally {
      setBusy(false)
    }
  }

  const activeBatches = (batches ?? []).filter((b) => b.status === 'RECEIVED' && b.qtyOnHand > 0)

  return (
    <Sheet open={row !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        {row && (
          <>
            <SheetHeader className="border-b p-6 pb-4">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle>{row.productName}</SheetTitle>
                {isLowStock(row) && <Badge variant="destructive">Low stock</Badge>}
              </div>
              <SheetDescription>
                {row.dose}
                {row.sku ? <span className="ml-1.5 font-mono text-xs">· {row.sku}</span> : null}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 p-6">
              {/* Stock summary */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-3">
                  <p className="text-xl font-bold">{row.onHand}</p>
                  <p className="text-xs text-muted-foreground">On hand</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {row.reserved}
                  </p>
                  <p className="text-xs text-muted-foreground">Reserved</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p
                    className={`text-xl font-bold ${isLowStock(row) ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                  >
                    {row.available}
                  </p>
                  <p className="text-xs text-muted-foreground">Available</p>
                </div>
              </div>

              {/* Reorder level + actions */}
              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">Reorder at</span>
                {editingReorder ? (
                  <span className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-20 text-right"
                      value={reorderValue}
                      onChange={(e) => setReorderValue(e.target.value)}
                      autoFocus
                    />
                    <Button size="sm" className="h-8" disabled={busy} onClick={saveReorderLevel}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setEditingReorder(false)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <button
                    className="flex items-center gap-1.5 font-semibold hover:underline"
                    onClick={() => {
                      setReorderValue(String(row.reorderLevel))
                      setEditingReorder(true)
                    }}
                  >
                    {row.reorderLevel}
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>

              <Button size="sm" onClick={() => setAdjustOpen(true)}>
                <PlusCircle className="mr-1.5 h-4 w-4" /> Adjust stock
              </Button>

              <Separator />

              {/* Active batches */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Boxes className="h-4 w-4 text-muted-foreground" /> Active batches
                  <span className="font-normal text-muted-foreground">
                    ({activeBatches.length})
                  </span>
                </p>
                {batches === null ? (
                  <Skeleton className="h-16 w-full" />
                ) : activeBatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No batches with stock on hand.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {activeBatches.map((b) => {
                      const tone = budTone(b.bud)
                      return (
                        <li key={b.id}>
                          <button
                            onClick={() => onOpenBatch(b.id)}
                            className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                          >
                            <span className="font-mono text-xs font-semibold">{b.batchNumber}</span>
                            <span className="flex items-center gap-2">
                              <span className="font-semibold">{b.qtyOnHand}</span>
                              <span
                                className={`text-xs ${
                                  tone === 'expired'
                                    ? 'text-red-600 dark:text-red-400'
                                    : tone === 'soon'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-muted-foreground'
                                }`}
                              >
                                BUD {fmtDate(b.bud)} · {budLabel(b.bud)}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <Separator />

              {/* Recent movements */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <History className="h-4 w-4 text-muted-foreground" /> Recent movements
                </p>
                {movements === null ? (
                  <Skeleton className="h-16 w-full" />
                ) : movements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No movements recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {movements.slice(0, 12).map((m) => (
                      <li key={m.id} className="flex items-start justify-between gap-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium">{REASON_LABELS[m.reason] ?? m.reason}</span>
                          {m.note && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {m.note}
                            </span>
                          )}
                          <span className="block text-xs text-muted-foreground">
                            {fmtDateTime(m.createdAt)} · {m.by}
                          </span>
                        </span>
                        <span
                          className={`flex-shrink-0 font-semibold ${m.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                        >
                          {m.delta > 0 ? `+${m.delta}` : m.delta}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Adjust stock dialog */}
            <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Adjust stock</DialogTitle>
                  <DialogDescription>
                    {row.productName} · {row.dose} — currently {row.onHand} on hand
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={adjustDir === 'add' ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={() => setAdjustDir('add')}
                    >
                      + Add
                    </Button>
                    <Button
                      type="button"
                      variant={adjustDir === 'remove' ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={() => setAdjustDir('remove')}
                    >
                      − Remove
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="adjust-qty">Quantity</Label>
                    <Input
                      id="adjust-qty"
                      type="number"
                      min={1}
                      value={adjustQty}
                      onChange={(e) => setAdjustQty(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reason</Label>
                    <Select value={adjustReason} onValueChange={setAdjustReason}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ADJUST_REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="adjust-note">Note (optional)</Label>
                    <Textarea
                      id="adjust-note"
                      placeholder="e.g. Physical count on 7/18 found 2 extra vials"
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAdjustOpen(false)}>
                    Cancel
                  </Button>
                  <Button disabled={busy || Number(adjustQty) < 1} onClick={submitAdjustment}>
                    {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Record adjustment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
