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

export interface ProductFormValues {
  id?: string
  name: string
  sku: string
  dose: string
  category: string
  unitCost: string
  srp: string
  supplierName: string
  supplierSku: string
  inventoryOnHand: string
  reorderLevel: string
}

const EMPTY: ProductFormValues = {
  name: '',
  sku: '',
  dose: '',
  category: '',
  unitCost: '',
  srp: '',
  supplierName: '',
  supplierSku: '',
  inventoryOnHand: '',
  reorderLevel: '',
}

const inputClass = 'bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/30'
const labelClass = 'text-white/70 text-xs'

function toNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[$,\s]/g, '').trim()
  if (cleaned === '') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Add / edit a single product variant. In edit mode, inventory on hand is not
 * editable (stock moves through Receive Inventory so the audit trail holds).
 */
export default function ProductFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set (with id), the dialog edits that variant; otherwise it creates. */
  initial?: ProductFormValues | null
  onSaved: () => void | Promise<void>
}) {
  const isEdit = Boolean(initial?.id)
  const [values, setValues] = useState<ProductFormValues>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValues(initial ? { ...initial } : { ...EMPTY })
      setError(null)
    }
  }, [open, initial])

  function set<K extends keyof ProductFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    setError(null)
    if (!values.name.trim() || !values.sku.trim()) {
      setError('Product name and SKU are required')
      return
    }
    const unitCost = toNumber(values.unitCost)
    const srp = toNumber(values.srp)
    const inventoryOnHand = toNumber(values.inventoryOnHand)
    const reorderLevel = toNumber(values.reorderLevel)
    for (const [label, raw, parsed] of [
      ['Cost', values.unitCost, unitCost],
      ['SRP', values.srp, srp],
      ['Starting inventory', values.inventoryOnHand, inventoryOnHand],
      ['Reorder level', values.reorderLevel, reorderLevel],
    ] as const) {
      if (raw.trim() !== '' && (parsed === undefined || parsed < 0)) {
        setError(`${label} must be a non-negative number`)
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        name: values.name.trim(),
        sku: values.sku.trim(),
        dose: values.dose.trim(),
        category: values.category.trim(),
        ...(unitCost !== undefined ? { unitCost } : {}),
        ...(srp !== undefined ? { srp } : {}),
        supplierName: values.supplierName.trim(),
        supplierSku: values.supplierSku.trim(),
        ...(reorderLevel !== undefined ? { reorderLevel: Math.trunc(reorderLevel) } : {}),
      }
      const res = isEdit
        ? await fetch(`/api/admin/products/${initial!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/admin/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              ...(inventoryOnHand !== undefined
                ? { inventoryOnHand: Math.trunc(inventoryOnHand) }
                : {}),
            }),
          })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || `Failed to ${isEdit ? 'update' : 'create'} product`)
      }
      await onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? 'Edit Product' : 'Add Product'}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {isEdit
              ? 'Update catalog details, pricing, and purchasing terms.'
              : 'Add a single product to the catalog. Use Import CSV for bulk entry.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={labelClass}>Product name *</Label>
              <Input
                className={inputClass}
                placeholder="Tesamorelin"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>SKU *</Label>
              <Input
                className={inputClass}
                placeholder="TES-10"
                value={values.sku}
                onChange={(e) => set('sku', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={labelClass}>Dose</Label>
              <Input
                className={inputClass}
                placeholder="10mg"
                value={values.dose}
                onChange={(e) => set('dose', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>Category</Label>
              <Input
                className={inputClass}
                placeholder="Peptides"
                value={values.category}
                onChange={(e) => set('category', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={labelClass}>Cost (what you pay) $</Label>
              <Input
                className={inputClass}
                placeholder="45.00"
                inputMode="decimal"
                value={values.unitCost}
                onChange={(e) => set('unitCost', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>SRP (selling price) $</Label>
              <Input
                className={inputClass}
                placeholder="129.00"
                inputMode="decimal"
                value={values.srp}
                onChange={(e) => set('srp', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={labelClass}>Supplier</Label>
              <Input
                className={inputClass}
                placeholder="Acme Peptides Inc"
                value={values.supplierName}
                onChange={(e) => set('supplierName', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelClass}>Supplier SKU</Label>
              <Input
                className={inputClass}
                placeholder="ACME-TES-10"
                value={values.supplierSku}
                onChange={(e) => set('supplierSku', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label className={labelClass}>Starting inventory (units)</Label>
                <Input
                  className={inputClass}
                  placeholder="0"
                  inputMode="numeric"
                  value={values.inventoryOnHand}
                  onChange={(e) => set('inventoryOnHand', e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className={labelClass}>Reorder level</Label>
              <Input
                className={inputClass}
                placeholder="5"
                inputMode="numeric"
                value={values.reorderLevel}
                onChange={(e) => set('reorderLevel', e.target.value)}
              />
            </div>
          </div>

          {isEdit && (
            <p className="text-white/40 text-xs">
              Stock on hand is managed on the Inventory page (Receive Inventory) so every change
              stays audited.
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-brand-primary hover:bg-[#1a30c0] text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
