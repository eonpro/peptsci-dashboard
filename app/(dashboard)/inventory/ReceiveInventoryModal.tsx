'use client'

/**
 * Receive Inventory modal.
 *
 * Existing catalog products are picked through a searchable variant combobox
 * (product + dose + SKU) and submitted by `variantId`, so intake can never
 * fork a duplicate variant from a typo. Creating a brand-new catalog entry is
 * an explicit, clearly-labeled second mode (name + dose free text).
 */

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, PackagePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { buildBatchNumber } from '@/lib/batch-number'
import type { CatalogStockRow } from './inventory-shared'

interface ReceiveInventoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReceived: () => void
  /** ACTIVE catalog variants, seeded by the workspace (no extra fetch). */
  catalog: CatalogStockRow[]
}

const DEFAULT_ACCENT = '#2b2c84'

export default function ReceiveInventoryModal({
  open,
  onOpenChange,
  onReceived,
  catalog,
}: ReceiveInventoryModalProps) {
  // Catalog-pick vs new-product mode
  const [newProduct, setNewProduct] = useState(false)
  const [variantId, setVariantId] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(
    () => catalog.find((v) => v.variantId === variantId) ?? null,
    [catalog, variantId]
  )

  function reset() {
    setNewProduct(false)
    setVariantId('')
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

  // Live preview of the auto-generated batch number.
  const previewBatch = useMemo(() => {
    const previewName = newProduct ? name.trim() : (selected?.productName ?? '')
    const previewDose = newProduct ? dose.trim() : (selected?.dose ?? '')
    if (!previewName || !previewDose || !bud) return ''
    try {
      return buildBatchNumber({ name: previewName, dose: previewDose, bud })
    } catch {
      return ''
    }
  }, [newProduct, name, dose, selected, bud])

  async function handleSubmit() {
    setError(null)
    if (newProduct) {
      if (!name.trim()) return setError('Product name is required')
      if (!dose.trim()) return setError('Dose (mg) is required')
    } else if (!variantId) {
      return setError('Pick a product from the catalog (or switch to "New product")')
    }
    if (!bud) return setError('BUD is required')
    const qty = Number(qtyReceived)
    if (!Number.isInteger(qty) || qty <= 0)
      return setError('Amount must be a positive whole number')

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/inventory/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(newProduct
            ? { name: name.trim(), dose: dose.trim() }
            : { variantId }),
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
          {/* Product picker / new-product toggle */}
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex items-center justify-between">
              <Label>{newProduct ? 'New Product' : 'Product'}</Label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <PackagePlus className="h-3.5 w-3.5" />
                New product
                <Switch checked={newProduct} onCheckedChange={setNewProduct} />
              </label>
            </div>

            {newProduct ? (
              <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="rcv-name" className="text-xs">
                      Product Name
                    </Label>
                    <Input
                      id="rcv-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Tesamorelin"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rcv-dose" className="text-xs">
                      Dose (mg)
                    </Label>
                    <Input
                      id="rcv-dose"
                      value={dose}
                      onChange={(e) => setDose(e.target.value)}
                      placeholder="e.g. 10mg"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  This creates a new catalog product + variant. Use the picker instead if the
                  product already exists — duplicates split stock counts.
                </p>
              </div>
            ) : (
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selected ? (
                      <span className="truncate">
                        {selected.productName}
                        {selected.dose ? ` · ${selected.dose}` : ''}
                        {selected.sku ? (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {selected.sku}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Search the catalog — product, dose, or SKU…
                      </span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search product, dose, SKU…" />
                    <CommandList>
                      <CommandEmpty>
                        No match. Toggle &quot;New product&quot; to add it to the catalog.
                      </CommandEmpty>
                      <CommandGroup>
                        {catalog.map((v) => (
                          <CommandItem
                            key={v.variantId}
                            value={`${v.productName} ${v.dose ?? ''} ${v.sku ?? ''}`}
                            onSelect={() => {
                              setVariantId(v.variantId)
                              setPickerOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                variantId === v.variantId ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                            <span className="min-w-0 truncate">
                              {v.productName}
                              {v.dose ? (
                                <span className="text-muted-foreground"> · {v.dose}</span>
                              ) : null}
                            </span>
                            {v.sku && (
                              <span className="ml-auto pl-3 font-mono text-xs text-muted-foreground">
                                {v.sku}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
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
            <Label htmlFor="rcv-received">Received On</Label>
            <Input
              id="rcv-received"
              type="date"
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
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
          <div>
            <Label htmlFor="rcv-notes">Notes (optional)</Label>
            <Input id="rcv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <span className="font-semibold">Auto batch #:</span>{' '}
          {previewBatch ? (
            <span className="font-mono">{previewBatch}</span>
          ) : (
            <span className="opacity-70">pick a product and BUD to preview</span>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
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
