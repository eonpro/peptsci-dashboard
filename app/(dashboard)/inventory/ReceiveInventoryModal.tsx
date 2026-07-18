'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildBatchNumber } from '@/lib/batch-number'

interface ProductOption {
  id: string
  productName: string
  dose: string | null
  sku: string | null
}

interface ReceiveInventoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReceived: () => void
}

const DEFAULT_ACCENT = '#2b2c84'

export default function ReceiveInventoryModal({
  open,
  onOpenChange,
  onReceived,
}: ReceiveInventoryModalProps) {
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [vialSize, setVialSize] = useState('')
  const [purity, setPurity] = useState('99%HPLC')
  const [bud, setBud] = useState('')
  const [receivedOn, setReceivedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [qtyReceived, setQtyReceived] = useState('')
  const [qtyDamaged, setQtyDamaged] = useState('0')
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT)
  const [notes, setNotes] = useState('')
  const [products, setProducts] = useState<ProductOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/admin/products')
      .then((r) => (r.ok ? r.json() : { variants: [] }))
      .then((data) => setProducts(data.variants ?? []))
      .catch(() => setProducts([]))
  }, [open])

  function reset() {
    setName('')
    setDose('')
    setVialSize('')
    setPurity('99%HPLC')
    setBud('')
    setReceivedOn(new Date().toISOString().slice(0, 10))
    setQtyReceived('')
    setQtyDamaged('0')
    setAccentColor(DEFAULT_ACCENT)
    setNotes('')
    setError(null)
  }

  // Distinct product names for the datalist — memoized so unrelated keystrokes
  // (qty, dose, notes…) don't rebuild the Set/Array on every render.
  const productNames = useMemo(
    () => Array.from(new Set(products.map((p) => p.productName))),
    [products]
  )

  // Live preview of the auto-generated batch number. Only recomputes when the
  // inputs that feed it change, so typing in other fields stays cheap.
  const previewBatch = useMemo(() => {
    if (!name.trim() || !dose.trim() || !bud) return ''
    try {
      return buildBatchNumber({ name, dose, bud })
    } catch {
      return ''
    }
  }, [name, dose, bud])

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) return setError('Product name is required')
    if (!dose.trim()) return setError('Dose (mg) is required')
    if (!bud) return setError('BUD is required')
    const qty = Number(qtyReceived)
    if (!Number.isInteger(qty) || qty <= 0) return setError('Amount must be a positive whole number')

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/inventory/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          dose: dose.trim(),
          vialSize: vialSize.trim() || undefined,
          purity: purity.trim() || undefined,
          bud,
          receivedOn,
          qtyReceived: qty,
          qtyDamaged: Number(qtyDamaged) || 0,
          yearColor: accentColor,
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to record inventory')
      }
      reset()
      onReceived()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record inventory')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive Inventory</DialogTitle>
          <DialogDescription>
            Record an inbound batch. The batch number and barcode are generated automatically and
            used on the labels.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="rcv-name">Product Name</Label>
            <Input
              id="rcv-name"
              list="rcv-product-list"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tesamorelin"
            />
            <datalist id="rcv-product-list">
              {productNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div>
            <Label htmlFor="rcv-dose">Dose (mg)</Label>
            <Input
              id="rcv-dose"
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="e.g. 10mg"
            />
          </div>
          <div>
            <Label htmlFor="rcv-vial">Vial Size</Label>
            <Input
              id="rcv-vial"
              value={vialSize}
              onChange={(e) => setVialSize(e.target.value)}
              placeholder="e.g. 3mL"
            />
          </div>

          <div>
            <Label htmlFor="rcv-purity">Purity (label)</Label>
            <Input id="rcv-purity" value={purity} onChange={(e) => setPurity(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rcv-bud">BUD (Beyond-Use Date)</Label>
            <Input id="rcv-bud" type="date" value={bud} onChange={(e) => setBud(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="rcv-qty">Amount Received</Label>
            <Input
              id="rcv-qty"
              type="number"
              min={1}
              value={qtyReceived}
              onChange={(e) => setQtyReceived(e.target.value)}
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <Label htmlFor="rcv-damaged">Damaged (optional)</Label>
            <Input
              id="rcv-damaged"
              type="number"
              min={0}
              value={qtyDamaged}
              onChange={(e) => setQtyDamaged(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="rcv-received">Received On</Label>
            <Input
              id="rcv-received"
              type="date"
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="rcv-accent">Label Accent</Label>
            <div className="flex items-center gap-2">
              <input
                id="rcv-accent"
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-input"
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-28"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="rcv-notes">Notes (optional)</Label>
            <Input id="rcv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
          <span className="font-semibold">Auto batch #:</span>{' '}
          {previewBatch ? (
            <span className="font-mono">{previewBatch}</span>
          ) : (
            <span className="text-blue-300/70">enter name, dose and BUD to preview</span>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Recording…' : 'Record Inventory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
