'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Plus, X } from 'lucide-react'
import { formToMonograph } from '@/lib/monograph-format'
import {
  composeBlendProduct,
  composeCompoundList,
  resolveBlendEditState,
  type BlendComponent,
} from '@/lib/products/blend'

export interface ProductFormValues {
  id?: string
  name: string
  sku: string
  dose: string
  category: string
  aka: string
  unitCost: string
  srp: string
  supplierName: string
  supplierSku: string
  inventoryOnHand: string
  reorderLevel: string
  // Editorial monograph (parent Product). Stored/edited as plain text; the
  // dialog serializes it into the structured JSON shape on save.
  purity: string
  overview: string
  mechanismOfAction: string
  observations: string
  references: string
}

const EMPTY: ProductFormValues = {
  name: '',
  sku: '',
  dose: '',
  category: '',
  aka: '',
  unitCost: '',
  srp: '',
  supplierName: '',
  supplierSku: '',
  inventoryOnHand: '',
  reorderLevel: '',
  purity: '',
  overview: '',
  mechanismOfAction: '',
  observations: '',
  references: '',
}

const inputClass = 'bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/30'
const labelClass = 'text-white/70 text-xs'

const EMPTY_BLEND: BlendComponent[] = [
  { name: '', amount: '' },
  { name: '', amount: '' },
]

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
  const [productType, setProductType] = useState<'single' | 'blend'>('single')
  const [blend, setBlend] = useState<BlendComponent[]>(EMPTY_BLEND)
  const [blendName, setBlendName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValues(initial ? { ...initial } : { ...EMPTY })
      // Compound-list names and known named blends (GLOW/KLOW) reopen in blend
      // mode. Slash-separated aka on a single peptide (e.g. Retatrutide
      // receptor list) must NOT flip the form into blend — that wiped the mg
      // dose on save.
      const blendState = initial
        ? resolveBlendEditState(initial.name, initial.dose, initial.aka, initial.sku)
        : null
      setProductType(blendState ? 'blend' : 'single')
      setBlend(blendState?.components ?? EMPTY_BLEND.map((c) => ({ ...c })))
      setBlendName(blendState?.blendName ?? '')
      setError(null)
    }
  }, [open, initial])

  function set<K extends keyof ProductFormValues>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function setBlendField(index: number, key: keyof BlendComponent, value: string) {
    setBlend((prev) => prev.map((c, i) => (i === index ? { ...c, [key]: value } : c)))
  }

  const blendPreview = composeBlendProduct(blend)

  async function save() {
    setError(null)
    let name = values.name.trim()
    let dose = values.dose.trim()
    let aka = values.aka.trim()
    if (productType === 'blend') {
      const filled = blend.filter((c) => c.name.trim() !== '')
      if (filled.length < 2) {
        setError('A blend needs at least two compound names')
        return
      }
      const amounts = filled.filter((c) => c.amount.trim() !== '')
      if (amounts.length > 0 && amounts.length < filled.length) {
        setError('Enter an mg amount for every compound (or leave them all blank)')
        return
      }
      const composed = composeBlendProduct(blend)
      dose = composed.dose
      if (blendName.trim()) {
        // Named blend (GLOW, KLOW…): the trade name is the product/label name
        // and the compound list becomes the subtitle unless one was typed.
        name = blendName.trim()
        aka = aka || composeCompoundList(blend)
      } else {
        name = composed.name
      }
    }
    if (!name || !values.sku.trim()) {
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
        name,
        sku: values.sku.trim(),
        dose,
        category: values.category.trim(),
        aka: aka || null,
        ...(unitCost !== undefined ? { unitCost } : {}),
        ...(srp !== undefined ? { srp } : {}),
        supplierName: values.supplierName.trim(),
        supplierSku: values.supplierSku.trim(),
        ...(reorderLevel !== undefined ? { reorderLevel: Math.trunc(reorderLevel) } : {}),
        purity: values.purity.trim() || null,
        monograph: formToMonograph({
          overview: values.overview,
          mechanismOfAction: values.mechanismOfAction,
          observations: values.observations,
          references: values.references,
        }),
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
          {/* Product type: single compound vs blend of compounds */}
          <div className="space-y-1.5">
            <Label className={labelClass}>Product type</Label>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-[#0a0e3a] p-1">
              {(
                [
                  { id: 'single', label: 'Single peptide' },
                  { id: 'blend', label: 'Blend' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setProductType(option.id)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    productType === option.id
                      ? 'bg-brand-primary text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {productType === 'single' ? (
            <>
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
            </>
          ) : (
            <>
              <div className="space-y-2 rounded-lg border border-white/10 bg-[#0a0e3a]/40 p-3">
                <div className="space-y-1.5">
                  <Label className={labelClass}>
                    Blend name (shown on labels — leave blank to list the compounds)
                  </Label>
                  <Input
                    className={inputClass}
                    placeholder="GLOW"
                    value={blendName}
                    onChange={(e) => setBlendName(e.target.value)}
                  />
                </div>
                <Label className={labelClass}>Blend compounds *</Label>
                {blend.map((component, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      {index === 0 && (
                        <Label className="text-white/40 text-[11px]">Compound name</Label>
                      )}
                      <Input
                        className={inputClass}
                        placeholder={index === 0 ? 'BPC-157' : 'TB-500'}
                        value={component.name}
                        onChange={(e) => setBlendField(index, 'name', e.target.value)}
                      />
                    </div>
                    <div className="w-28 space-y-1.5">
                      {index === 0 && (
                        <Label className="text-white/40 text-[11px]">Amount (mg)</Label>
                      )}
                      <Input
                        className={inputClass}
                        placeholder="5mg"
                        value={component.amount}
                        onChange={(e) => setBlendField(index, 'amount', e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={blend.length <= 2}
                      onClick={() => setBlend((prev) => prev.filter((_, i) => i !== index))}
                      className="border-white/20 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30"
                      aria-label={`Remove compound ${index + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBlend((prev) => [...prev, { name: '', amount: '' }])}
                  className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add compound
                </Button>
                {blendPreview.name && (
                  <p className="text-white/40 text-xs">
                    Saved as:{' '}
                    <span className="text-white/70">
                      {blendName.trim() || blendPreview.name}
                    </span>
                    {blendPreview.dose && (
                      <>
                        {' — '}
                        <span className="text-white/70">{blendPreview.dose}</span>
                      </>
                    )}
                    {blendName.trim() && (
                      <>
                        {' · subtitle: '}
                        <span className="text-white/70">{composeCompoundList(blend)}</span>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelClass}>SKU *</Label>
                  <Input
                    className={inputClass}
                    placeholder="BPC-TB-10"
                    value={values.sku}
                    onChange={(e) => set('sku', e.target.value)}
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
            </>
          )}

          <div className="space-y-1.5">
            <Label className={labelClass}>Also known as (subtitle under the product name)</Label>
            <Input
              className={inputClass}
              placeholder="Lysine-Proline-Valine"
              value={values.aka}
              onChange={(e) => set('aka', e.target.value)}
            />
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

          {/* Monograph — shown on the product detail page */}
          <div className="mt-2 space-y-4 rounded-lg border border-white/10 bg-[#0a0e3a]/40 p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Monograph</h3>
              <p className="text-white/40 text-xs">
                Editorial content shown on the product detail page. Keep it neutral and
                research-use-only. Leave blank to hide a section.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelClass}>Purity</Label>
                <Input
                  className={inputClass}
                  placeholder="99%"
                  value={values.purity}
                  onChange={(e) => set('purity', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={labelClass}>Overview (one paragraph per line)</Label>
              <Textarea
                className={inputClass}
                rows={3}
                placeholder="LL-37 is an endogenous human cathelicidin-derived peptide studied for..."
                value={values.overview}
                onChange={(e) => set('overview', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className={labelClass}>Mechanism of Action (one bullet per line)</Label>
              <Textarea
                className={inputClass}
                rows={3}
                placeholder={'Membrane Interaction: shown in vitro to disrupt microbial membranes...\nImmunomodulation: research suggests it may influence innate immune signaling...'}
                value={values.mechanismOfAction}
                onChange={(e) => set('mechanismOfAction', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className={labelClass}>Observations (one per line — &quot;Title | detail&quot;)</Label>
              <Textarea
                className={inputClass}
                rows={3}
                placeholder={'Wound-Healing Research | Early-phase studies report support for granulation tissue formation.\nAntimicrobial Activity | In vitro testing shows broad activity against Gram-positive and Gram-negative organisms.'}
                value={values.observations}
                onChange={(e) => set('observations', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className={labelClass}>References (one per line — &quot;label | url&quot;)</Label>
              <Textarea
                className={inputClass}
                rows={3}
                placeholder={'Grönberg A, et al. (2014). Wound Repair Regen. | https://pubmed.ncbi.nlm.nih.gov/25041627/'}
                value={values.references}
                onChange={(e) => set('references', e.target.value)}
              />
            </div>
          </div>

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
