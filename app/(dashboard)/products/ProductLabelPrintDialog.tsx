'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FileText, Loader2, Printer } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiError } from '@/lib/api-error'
import { toast } from 'sonner'
import {
  type BatchRow,
  SHEET_MAX,
  budLabel,
  fmtDate,
} from '@/app/(dashboard)/inventory/inventory-shared'

export interface ProductLabelVariantRef {
  id: string
  productName: string
  dose: string | null
  sku: string | null
}

interface ProductLabelPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  variant: ProductLabelVariantRef | null
}

const inputClass = 'bg-[#0a0e3a] border-white/10 text-white'

function pickDefaultBatch(batches: BatchRow[]): string {
  const withStock = batches
    .filter((b) => b.status === 'RECEIVED' && b.qtyOnHand > 0)
    .sort((a, b) => new Date(a.bud).getTime() - new Date(b.bud).getTime())
  if (withStock[0]) return withStock[0].id
  const byBud = [...batches].sort(
    (a, b) => new Date(a.bud).getTime() - new Date(b.bud).getTime()
  )
  return byBud[0]?.id ?? ''
}

export default function ProductLabelPrintDialog({
  open,
  onOpenChange,
  variant,
}: ProductLabelPrintDialogProps) {
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [batchId, setBatchId] = useState('')
  const [printQty, setPrintQty] = useState(String(SHEET_MAX))

  const selected = useMemo(
    () => batches.find((b) => b.id === batchId) ?? null,
    [batches, batchId]
  )

  const load = useCallback(async () => {
    if (!variant) return
    setLoading(true)
    setBatches([])
    setBatchId('')
    try {
      const res = await fetch(
        `/api/admin/inventory/batches?status=ALL&variantId=${encodeURIComponent(variant.id)}&t=${Date.now()}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw await apiError(res, 'Could not load batches')
      const data = await res.json()
      const rows = (Array.isArray(data?.batches) ? data.batches : []).filter(
        (b: BatchRow) => b.status !== 'VOIDED'
      ) as BatchRow[]
      setBatches(rows)
      const nextId = pickDefaultBatch(rows)
      setBatchId(nextId)
      const def = rows.find((b) => b.id === nextId)
      setPrintQty(
        String(Math.min(SHEET_MAX, Math.max(1, def?.qtyOnHand || SHEET_MAX)))
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load batches')
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }, [variant, onOpenChange])

  useEffect(() => {
    if (open && variant) void load()
  }, [open, variant, load])

  function onBatchChange(id: string) {
    setBatchId(id)
    const b = batches.find((row) => row.id === id)
    if (b) {
      setPrintQty(String(Math.min(SHEET_MAX, Math.max(1, b.qtyOnHand || SHEET_MAX))))
    }
  }

  async function downloadLabels(opts: { proofMode?: boolean; quantity?: number }) {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/inventory/labels/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: selected.id, ...opts }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to generate labels')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `peptsci-labels-${selected.batchNumber}${opts.proofMode ? '-proof' : ''}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success(opts.proofMode ? 'Proof label downloaded' : 'Label sheet downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate labels')
    } finally {
      setBusy(false)
    }
  }

  const subtitle = variant
    ? [variant.productName, variant.dose, variant.sku].filter(Boolean).join(' · ')
    : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Print labels</DialogTitle>
          <DialogDescription className="text-white/60">
            {subtitle || 'Select a batch and download a label sheet.'} A full sheet holds{' '}
            {SHEET_MAX} labels.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : batches.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-[#0a0e3a]/40 px-4 py-6 text-sm text-white/70">
            <p className="mb-2">No inventory batches for this product yet.</p>
            <p>
              Receive stock first via{' '}
              <Link href="/inventory" className="text-[#5B8BFF] hover:underline">
                Inventory → Receive Inventory
              </Link>
              , then print labels here.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">Batch</Label>
              <Select value={batchId} onValueChange={onBatchChange}>
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent className="bg-brand-onyx border-white/10 text-white">
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="focus:bg-white/10 focus:text-white">
                      {b.batchNumber} · BUD {fmtDate(b.bud)} ({budLabel(b.bud)}) ·{' '}
                      {b.qtyOnHand} on hand
                      {b.status === 'DEPLETED' ? ' · depleted' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-print-qty" className="text-white/70 text-xs">
                Number of labels
              </Label>
              <Input
                id="product-print-qty"
                type="number"
                min={1}
                max={SHEET_MAX}
                value={printQty}
                onChange={(e) => setPrintQty(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
          >
            {batches.length === 0 && !loading ? 'Close' : 'Cancel'}
          </Button>
          {batches.length > 0 && (
            <>
              <Button
                variant="outline"
                disabled={busy || !selected}
                onClick={() => void downloadLabels({ proofMode: true })}
                className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4" />
                )}
                Proof
              </Button>
              <Button
                disabled={busy || !selected}
                onClick={() => {
                  const qty = Math.min(
                    SHEET_MAX,
                    Math.max(1, Math.trunc(Number(printQty) || SHEET_MAX))
                  )
                  void downloadLabels({ quantity: qty })
                }}
                className="bg-brand-primary hover:bg-[#1a30c0] text-white"
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-1.5 h-4 w-4" />
                )}
                Download PDF
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
