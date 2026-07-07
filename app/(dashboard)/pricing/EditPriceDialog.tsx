'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { PriceSheet } from '@/lib/pricing'

function toNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[$,\s]/g, '').trim()
  if (cleaned === '') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

/** Edit a variant's base Cost / SRP straight from the Pricing page. */
export default function EditPriceDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  /** The price row being edited, or null when closed. */
  row: PriceSheet | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void | Promise<void>
}) {
  const [cost, setCost] = useState('')
  const [srp, setSrp] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (row) {
      setCost(row.Cost.toFixed(2))
      setSrp(row.SRP.toFixed(2))
      setError(null)
    }
  }, [row])

  async function save() {
    if (!row?.Id) return
    const unitCost = toNumber(cost)
    const srpVal = toNumber(srp)
    if (unitCost === undefined || unitCost < 0 || srpVal === undefined || srpVal < 0) {
      setError('Cost and SRP must be non-negative numbers')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/products/${row.Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitCost, srp: srpVal }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to update pricing')
      }
      toast.success(`Pricing updated for ${row.Product}${row.Dose ? ` ${row.Dose}` : ''}`)
      await onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update pricing')
    } finally {
      setSaving(false)
    }
  }

  const margin = (() => {
    const c = toNumber(cost)
    const s = toNumber(srp)
    if (c === undefined || s === undefined || s <= 0) return null
    return (((s - c) / s) * 100).toFixed(1)
  })()

  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Edit Pricing</DialogTitle>
          <DialogDescription>
            {row ? `${row.Product}${row.Dose ? ` — ${row.Dose}` : ''} (${row.SKU})` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cost (what you pay) $</Label>
              <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SRP (selling price) $</Label>
              <Input inputMode="decimal" value={srp} onChange={(e) => setSrp(e.target.value)} />
            </div>
          </div>
          {margin !== null && (
            <p className="text-sm text-muted-foreground">Margin: {margin}%</p>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
