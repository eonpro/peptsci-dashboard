'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  FileUp,
  AlertCircle,
  Download,
  ExternalLink,
  Eye,
} from 'lucide-react'
import { CoaCertificate } from '@/components/coa/CoaCertificate'
import { CoaScaledPreview } from '@/components/coa/CoaScaledPreview'
import type { CoaData } from '@/lib/coa'
import { apiError } from '@/lib/api-error'
import { cn } from '@/lib/utils'
import {
  blendComponentsForCoa,
  blendContextFor,
  coverBlendComponents,
  prefillFromBlendPart,
  type CoaBlendPart,
} from '@/lib/coa-blend'

export interface CoaVariantRef {
  id: string
  sku: string | null
  productName: string
  dose: string | null
}

interface CoaForm {
  compoundName: string
  doseLabel: string
  casNumber: string
  appearance: string
  batchNumber: string
  taskNumber: string
  reportCode: string
  issuingLab: string
  signedBy: string
  manufacturer: string
  testingLab: string
  clientOfRecord: string
  distributor: string
  orderedOn: string
  receivedOn: string
  analyzedOn: string
  purityPercent: string
  puritySpecMin: string
  purityRejectMax: string
  assayMeasuredMg: string
  assayLabelClaimMg: string
  identitySpec: string
  identityResult: string
  notes: string
  published: boolean
}

const inputClass = 'bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/30'

function emptyForm(variant: CoaVariantRef, part?: CoaBlendPart | null): CoaForm {
  const prefill = part ? prefillFromBlendPart(part) : null
  return {
    compoundName: prefill?.compoundName || (part ? part.name : variant.productName || ''),
    doseLabel: prefill?.doseLabel || (part ? part.amount : variant.dose || ''),
    casNumber: prefill?.casNumber || '',
    appearance: 'Lyophilized powder',
    batchNumber: '',
    taskNumber: '',
    reportCode: '',
    issuingLab: '',
    signedBy: '',
    manufacturer: '',
    testingLab: '',
    clientOfRecord: '',
    distributor: 'peptsci.com',
    orderedOn: '',
    receivedOn: '',
    analyzedOn: '',
    purityPercent: '',
    puritySpecMin: '98',
    purityRejectMax: '2',
    assayMeasuredMg: '',
    assayLabelClaimMg: prefill?.assayLabelClaimMg || '',
    identitySpec: prefill?.identitySpec || '',
    identityResult: prefill?.identityResult || '',
    notes: '',
    published: true,
  }
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function coaToForm(coa: CoaData): CoaForm {
  const s = (v: string | null) => v ?? ''
  const n = (v: number | null) => (v == null ? '' : String(v))
  return {
    compoundName: coa.compoundName,
    doseLabel: s(coa.doseLabel),
    casNumber: s(coa.casNumber),
    appearance: s(coa.appearance),
    batchNumber: s(coa.batchNumber),
    taskNumber: s(coa.taskNumber),
    reportCode: s(coa.reportCode),
    issuingLab: s(coa.issuingLab),
    signedBy: s(coa.signedBy),
    manufacturer: s(coa.manufacturer),
    testingLab: s(coa.testingLab),
    clientOfRecord: s(coa.clientOfRecord),
    distributor: s(coa.distributor),
    orderedOn: isoToDateInput(coa.orderedOn),
    receivedOn: isoToDateInput(coa.receivedOn),
    analyzedOn: isoToDateInput(coa.analyzedOn),
    purityPercent: n(coa.purityPercent),
    puritySpecMin: n(coa.puritySpecMin),
    purityRejectMax: n(coa.purityRejectMax),
    assayMeasuredMg: n(coa.assayMeasuredMg),
    assayLabelClaimMg: n(coa.assayLabelClaimMg),
    identitySpec: s(coa.identitySpec),
    identityResult: s(coa.identityResult),
    notes: s(coa.notes),
    published: coa.published,
  }
}

const num = (v: string): number | null => {
  if (v.trim() === '') return null
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : null
}
const dateIso = (v: string): string | null => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function formToPreview(
  form: CoaForm,
  variantId: string,
  existing: CoaData | null,
  fileObjectUrl: string | null,
  fileName: string | null
): CoaData {
  const str = (v: string) => (v.trim() === '' ? null : v.trim())
  return {
    id: existing?.id ?? 'preview',
    variantId,
    compoundName: form.compoundName.trim() || '—',
    doseLabel: str(form.doseLabel),
    casNumber: str(form.casNumber),
    appearance: str(form.appearance),
    batchNumber: str(form.batchNumber),
    taskNumber: str(form.taskNumber),
    reportCode: str(form.reportCode),
    issuingLab: str(form.issuingLab),
    signedBy: str(form.signedBy),
    manufacturer: str(form.manufacturer),
    testingLab: str(form.testingLab),
    clientOfRecord: str(form.clientOfRecord),
    distributor: str(form.distributor),
    orderedOn: dateIso(form.orderedOn),
    receivedOn: dateIso(form.receivedOn),
    analyzedOn: dateIso(form.analyzedOn),
    purityPercent: num(form.purityPercent),
    puritySpecMin: num(form.puritySpecMin),
    purityRejectMax: num(form.purityRejectMax),
    assayMeasuredMg: num(form.assayMeasuredMg),
    assayLabelClaimMg: num(form.assayLabelClaimMg),
    identitySpec: str(form.identitySpec),
    identityResult: str(form.identityResult),
    notes: str(form.notes),
    published: form.published,
    hasFile: !!(fileObjectUrl || existing?.hasFile),
    fileName: fileName ?? existing?.fileName ?? null,
    contentType: existing?.contentType ?? null,
    fileUrl: fileObjectUrl ?? existing?.fileUrl ?? null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function claimLine(coa: CoaData): string {
  const bits: string[] = []
  if (coa.purityPercent != null) bits.push(`${coa.purityPercent}% purity`)
  if (coa.assayMeasuredMg != null && coa.assayLabelClaimMg != null && coa.assayLabelClaimMg > 0) {
    const pct = ((coa.assayMeasuredMg / coa.assayLabelClaimMg) * 100).toFixed(1)
    bits.push(`${coa.assayMeasuredMg} mg / ${coa.assayLabelClaimMg} mg claim (${pct}%)`)
  }
  return bits.join(' · ') || 'No results entered'
}

function printHref(variantId: string, coaId?: string): string {
  const q = new URLSearchParams({ variantId })
  if (coaId) q.set('coa', coaId)
  return `/print/coa?${q.toString()}`
}

export default function CoaManagerDialog({
  open,
  onOpenChange,
  variant,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  variant: CoaVariantRef | null
  onChanged?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coas, setCoas] = useState<CoaData[]>([])
  const [mode, setMode] = useState<'list' | 'view' | 'form'>('list')
  const [viewIdx, setViewIdx] = useState(0)
  const [editing, setEditing] = useState<CoaData | null>(null)
  const [form, setForm] = useState<CoaForm | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const blendParts = variant
    ? blendComponentsForCoa(variant.productName, variant.dose)
    : null
  const isBlend = !!blendParts && blendParts.length >= 2
  const coverage = blendParts ? coverBlendComponents(blendParts, coas) : null
  const blendCtx = (compound: string) =>
    variant ? blendContextFor(variant.productName, variant.dose, compound) : null

  const load = useCallback(async () => {
    if (!variant) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/products/${variant.id}/coa`)
      if (!res.ok) throw await apiError(res, 'Failed to load certificates')
      const data = await res.json()
      setCoas(Array.isArray(data?.coas) ? data.coas : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load certificates')
    } finally {
      setLoading(false)
    }
  }, [variant])

  useEffect(() => {
    if (open && variant) {
      setMode('list')
      setEditing(null)
      setForm(null)
      setFile(null)
      setError(null)
      setViewIdx(0)
      load()
    }
  }, [open, variant, load])

  useEffect(() => {
    return () => {
      if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl)
    }
  }, [fileObjectUrl])

  function startAdd(part?: CoaBlendPart | null) {
    if (!variant) return
    const chosen =
      part ??
      coverage?.missing[0] ??
      (isBlend ? blendParts![0] : null)
    setEditing(null)
    setForm(emptyForm(variant, chosen))
    setFile(null)
    if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl)
    setFileObjectUrl(null)
    setMode('form')
  }

  function applyPart(part: CoaBlendPart) {
    setForm((prev) => (prev ? { ...prev, ...prefillFromBlendPart(part) } : prev))
  }

  function startEdit(coa: CoaData) {
    setEditing(coa)
    setForm(coaToForm(coa))
    setFile(null)
    if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl)
    setFileObjectUrl(null)
    setMode('form')
  }

  function startView(idx = 0) {
    setViewIdx(idx)
    setMode('view')
  }

  function onFilePicked(f: File | null) {
    if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl)
    setFile(f)
    setFileObjectUrl(f ? URL.createObjectURL(f) : null)
  }

  function set<K extends keyof CoaForm>(key: K, value: CoaForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function save() {
    if (!variant || !form) return
    if (!form.compoundName.trim()) {
      setError('Compound name is required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        purityPercent: num(form.purityPercent),
        puritySpecMin: num(form.puritySpecMin),
        purityRejectMax: num(form.purityRejectMax),
        assayMeasuredMg: num(form.assayMeasuredMg),
        assayLabelClaimMg: num(form.assayLabelClaimMg),
        orderedOn: form.orderedOn || null,
        receivedOn: form.receivedOn || null,
        analyzedOn: form.analyzedOn || null,
      }
      const fd = new FormData()
      fd.append('data', JSON.stringify(payload))
      if (file) fd.append('file', file)

      const url = editing
        ? `/api/admin/products/${variant.id}/coa/${editing.id}`
        : `/api/admin/products/${variant.id}/coa`
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to save certificate')

      await load()
      onChanged?.()
      setMode('list')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save certificate')
    } finally {
      setSaving(false)
    }
  }

  async function remove(coa: CoaData) {
    if (!variant) return
    if (!window.confirm('Delete this certificate of analysis? This cannot be undone.')) return
    setDeletingId(coa.id)
    setError(null)
    try {
      const res = await fetch(`/api/admin/products/${variant.id}/coa/${coa.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to delete certificate')
      }
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete certificate')
    } finally {
      setDeletingId(null)
    }
  }

  const preview =
    form && variant
      ? formToPreview(form, variant.id, editing, fileObjectUrl, file?.name ?? null)
      : null
  const viewCoas =
    coverage && coverage.matched.length > 0
      ? [...coverage.matched.map((m) => m.coa), ...coverage.extra]
      : coas
  const activeView = viewCoas[Math.min(viewIdx, Math.max(0, viewCoas.length - 1))] ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[min(1100px,96vw)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-white/10 bg-brand-onyx p-0 text-white">
        <DialogHeader className="shrink-0 border-b border-white/10 px-5 py-4 pr-14">
          <DialogTitle className="text-white">
            Certificates of Analysis
            {variant ? (
              <span className="font-normal text-white/50">
                {' '}
                — {variant.productName}
                {variant.dose ? ` · ${variant.dose}` : ''}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {isBlend
              ? 'This is a blend. Each certificate is one peptide — label claim is that peptide\'s mg, not the vial total.'
              : mode === 'form'
                ? 'Enter the values exactly as reported on the supplier certificate. The preview updates live.'
                : 'Upload the supplier certificate and enter the results. Published certificates appear on the storefront.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {mode === 'list' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-end gap-2">
                {coas.length > 0 && variant && (
                  <>
                    <Button
                      variant="outline"
                      className="border-white/20 text-white/80 hover:bg-white/10 hover:text-white"
                      onClick={() => startView(0)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      View full COA
                    </Button>
                    <a href={printHref(variant.id)} target="_blank" rel="noopener noreferrer">
                      <Button className="bg-brand-primary text-white hover:bg-[#1a30c0]">
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </Button>
                    </a>
                  </>
                )}
                <Button onClick={() => startAdd()} className="bg-brand-primary text-white hover:bg-[#1a30c0]">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Certificate
                </Button>
              </div>

              {isBlend && (
                <div className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#9aa8ff]">
                    {blendParts!.length}-peptide blend — one COA per component
                  </p>
                  <p className="mt-1 text-xs text-white/55">
                    Assay % is that peptide vs its own label claim. Ipamorelin 5.93 mg vs 5 mg is
                    118.6% of the 5 mg claim, not of Tesamorelin 10 mg + Ipamorelin 5 mg.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {blendParts!.map((part) => {
                      const hit = coverage?.matched.find((m) => m.part.name === part.name)
                      return (
                        <div
                          key={part.name}
                          className="rounded-md border border-white/10 bg-[#0a0e3a]/60 px-3 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-white">
                              {part.name}
                              {part.amount ? (
                                <span className="text-white/50"> · {part.amount}</span>
                              ) : null}
                            </p>
                            {hit ? (
                              <Badge className="border-green-500/30 bg-green-500/15 text-green-400">
                                On file
                              </Badge>
                            ) : (
                              <Badge className="border-amber-400/30 bg-amber-400/15 text-amber-300">
                                Missing
                              </Badge>
                            )}
                          </div>
                          {hit ? (
                            <p className="mt-1 text-xs text-white/55">{claimLine(hit.coa)}</p>
                          ) : (
                            <button
                              type="button"
                              className="mt-1 text-xs text-[#9aa8ff] hover:underline"
                              onClick={() => startAdd(part)}
                            >
                              Add {part.name} certificate
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12 text-white/60">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Loading certificates...
                </div>
              ) : coas.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-[#0a0e3a]/40 p-8 text-center text-white/50">
                  No certificates yet. Add one to attach a supplier COA to this product.
                </div>
              ) : (
                <div className="space-y-2">
                  {coas.map((coa) => (
                    <div
                      key={coa.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0a0e3a]/50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-white">
                            {coa.compoundName}
                            {coa.doseLabel ? ` · ${coa.doseLabel}` : ''}
                          </span>
                          {coa.published ? (
                            <Badge className="border-green-500/30 bg-green-500/15 text-green-400">
                              Published
                            </Badge>
                          ) : (
                            <Badge className="border-white/20 bg-white/10 text-white/60">Draft</Badge>
                          )}
                          {coa.hasFile && (
                            <Badge className="border-brand-primary/30 bg-brand-primary/15 text-[#7d90ff]">
                              Source doc
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-white/50">
                          {coa.batchNumber ? `Batch ${coa.batchNumber} · ` : ''}
                          {claimLine(coa)}
                          {coa.testingLab || coa.issuingLab
                            ? ` · ${coa.testingLab || coa.issuingLab}`
                            : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View full certificate"
                          onClick={() => startView(Math.max(0, viewCoas.findIndex((c) => c.id === coa.id)))}
                          className="h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {variant && (
                          <a
                            href={printHref(variant.id, coa.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Download PDF"
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit certificate"
                          onClick={() => startEdit(coa)}
                          className="h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete certificate"
                          disabled={deletingId === coa.id}
                          onClick={() => remove(coa)}
                          className="h-8 w-8 text-white/50 hover:bg-red-500/10 hover:text-red-400"
                        >
                          {deletingId === coa.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : mode === 'view' && activeView && variant ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {viewCoas.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto">
                    {viewCoas.map((coa, i) => (
                      <button
                        key={coa.id}
                        type="button"
                        onClick={() => setViewIdx(i)}
                        className={cn(
                          'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          i === viewIdx
                            ? 'border-brand-primary bg-brand-primary text-white'
                            : 'border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                        )}
                      >
                        {[coa.compoundName, coa.doseLabel].filter(Boolean).join(' · ')}
                      </button>
                    ))}
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {activeView.hasFile && activeView.fileUrl && (
                    <a
                      href={activeView.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Original
                    </a>
                  )}
                  <a
                    href={printHref(variant.id, activeView.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a30c0]"
                  >
                    <Download className="h-3.5 w-3.5" /> Download PDF
                  </a>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-[#04051f] p-3">
                <CoaCertificate
                  data={activeView}
                  logoSrc="/brand/peptsci-logo-dark.png"
                  blendContext={blendCtx(activeView.compoundName)}
                />
              </div>
            </div>
          ) : form ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-5">
                {isBlend && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
                      Which peptide is this certificate for?
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {blendParts!.map((part) => {
                        const selected =
                          form.compoundName.trim().toLowerCase() === part.name.trim().toLowerCase()
                        return (
                          <button
                            key={part.name}
                            type="button"
                            onClick={() => applyPart(part)}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs font-medium',
                              selected
                                ? 'border-brand-primary bg-brand-primary text-white'
                                : 'border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                            )}
                          >
                            {part.name}
                            {part.amount ? ` · ${part.amount}` : ''}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-white/45">
                      Label claim (mg) is this peptide only
                      {form.assayLabelClaimMg ? ` — currently ${form.assayLabelClaimMg} mg.` : '.'}
                    </p>
                  </div>
                )}

                <Section title="Identity">
                  <Field label="Compound name *">
                    <Input
                      className={inputClass}
                      value={form.compoundName}
                      onChange={(e) => set('compoundName', e.target.value)}
                    />
                  </Field>
                  <Grid>
                    <Field label="Dose label">
                      <Input
                        className={inputClass}
                        placeholder="50 mg"
                        value={form.doseLabel}
                        onChange={(e) => set('doseLabel', e.target.value)}
                      />
                    </Field>
                    <Field label="CAS number">
                      <Input
                        className={inputClass}
                        value={form.casNumber}
                        onChange={(e) => set('casNumber', e.target.value)}
                      />
                    </Field>
                  </Grid>
                  <Grid>
                    <Field label="Appearance">
                      <Input
                        className={inputClass}
                        value={form.appearance}
                        onChange={(e) => set('appearance', e.target.value)}
                      />
                    </Field>
                    <Field label="Batch / lot number">
                      <Input
                        className={inputClass}
                        value={form.batchNumber}
                        onChange={(e) => set('batchNumber', e.target.value)}
                      />
                    </Field>
                  </Grid>
                </Section>

                <Section title="Purity & assay">
                  <Grid>
                    <Field label="Purity %">
                      <Input
                        className={inputClass}
                        inputMode="decimal"
                        placeholder="99.669"
                        value={form.purityPercent}
                        onChange={(e) => set('purityPercent', e.target.value)}
                      />
                    </Field>
                    <Field label="Purity spec floor %">
                      <Input
                        className={inputClass}
                        inputMode="decimal"
                        value={form.puritySpecMin}
                        onChange={(e) => set('puritySpecMin', e.target.value)}
                      />
                    </Field>
                  </Grid>
                  <Grid>
                    <Field label="Impurity allowance %">
                      <Input
                        className={inputClass}
                        inputMode="decimal"
                        value={form.purityRejectMax}
                        onChange={(e) => set('purityRejectMax', e.target.value)}
                      />
                    </Field>
                    <div />
                  </Grid>
                  <Grid>
                    <Field label="Assay measured (mg)">
                      <Input
                        className={inputClass}
                        inputMode="decimal"
                        placeholder="50.69"
                        value={form.assayMeasuredMg}
                        onChange={(e) => set('assayMeasuredMg', e.target.value)}
                      />
                    </Field>
                    <Field
                      label={
                        isBlend
                          ? `Label claim (mg) — this peptide only`
                          : 'Label claim (mg)'
                      }
                    >
                      <Input
                        className={inputClass}
                        inputMode="decimal"
                        placeholder="50"
                        value={form.assayLabelClaimMg}
                        onChange={(e) => set('assayLabelClaimMg', e.target.value)}
                      />
                    </Field>
                  </Grid>
                </Section>

                <Section title="Identity confirmation">
                  <Grid>
                    <Field label="Specification">
                      <Input
                        className={inputClass}
                        value={form.identitySpec}
                        onChange={(e) => set('identitySpec', e.target.value)}
                      />
                    </Field>
                    <Field label="Result">
                      <Input
                        className={inputClass}
                        value={form.identityResult}
                        onChange={(e) => set('identityResult', e.target.value)}
                      />
                    </Field>
                  </Grid>
                </Section>

                <Section title="Parties & certificate">
                  <Grid>
                    <Field label="Manufacturer">
                      <Input
                        className={inputClass}
                        value={form.manufacturer}
                        onChange={(e) => set('manufacturer', e.target.value)}
                      />
                    </Field>
                    <Field label="Testing lab">
                      <Input
                        className={inputClass}
                        value={form.testingLab}
                        onChange={(e) => set('testingLab', e.target.value)}
                      />
                    </Field>
                  </Grid>
                  <Grid>
                    <Field label="Client of record">
                      <Input
                        className={inputClass}
                        value={form.clientOfRecord}
                        onChange={(e) => set('clientOfRecord', e.target.value)}
                      />
                    </Field>
                    <Field label="Distributor">
                      <Input
                        className={inputClass}
                        value={form.distributor}
                        onChange={(e) => set('distributor', e.target.value)}
                      />
                    </Field>
                  </Grid>
                  <Grid>
                    <Field label="Issuing lab">
                      <Input
                        className={inputClass}
                        value={form.issuingLab}
                        onChange={(e) => set('issuingLab', e.target.value)}
                      />
                    </Field>
                    <Field label="Signed by">
                      <Input
                        className={inputClass}
                        value={form.signedBy}
                        onChange={(e) => set('signedBy', e.target.value)}
                      />
                    </Field>
                  </Grid>
                  <Grid>
                    <Field label="Task / report #">
                      <Input
                        className={inputClass}
                        value={form.taskNumber}
                        onChange={(e) => set('taskNumber', e.target.value)}
                      />
                    </Field>
                    <Field label="Report code">
                      <Input
                        className={inputClass}
                        value={form.reportCode}
                        onChange={(e) => set('reportCode', e.target.value)}
                      />
                    </Field>
                  </Grid>
                </Section>

                <Section title="Chain of custody">
                  <Grid>
                    <Field label="Ordered">
                      <Input
                        type="date"
                        className={inputClass}
                        value={form.orderedOn}
                        onChange={(e) => set('orderedOn', e.target.value)}
                      />
                    </Field>
                    <Field label="Received">
                      <Input
                        type="date"
                        className={inputClass}
                        value={form.receivedOn}
                        onChange={(e) => set('receivedOn', e.target.value)}
                      />
                    </Field>
                  </Grid>
                  <Grid>
                    <Field label="Analyzed">
                      <Input
                        type="date"
                        className={inputClass}
                        value={form.analyzedOn}
                        onChange={(e) => set('analyzedOn', e.target.value)}
                      />
                    </Field>
                    <div />
                  </Grid>
                </Section>

                <Section title="Source document & notes">
                  <Field label="Supplier certificate (JPG, PNG, or PDF)">
                    <div
                      className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/15 bg-[#0a0e3a]/40 px-4 py-5 text-center hover:border-brand-primary/60"
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        const f = e.dataTransfer.files?.[0]
                        if (f) onFilePicked(f)
                      }}
                    >
                      <FileUp className="mb-1 h-5 w-5 text-white/40" />
                      <p className="text-sm text-white/80">
                        {file ? (
                          <span className="text-white">{file.name}</span>
                        ) : editing?.hasFile ? (
                          <span className="text-white/70">
                            {editing.fileName || 'Existing document'} — click to replace
                          </span>
                        ) : (
                          'Click to choose a file or drag it here'
                        )}
                      </p>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  </Field>
                  <Field label="Qualification notes (optional)">
                    <Textarea
                      className={inputClass}
                      rows={3}
                      placeholder="e.g. Source certificate reports purity and assay only — no sterility, endotoxin, or heavy-metal data."
                      value={form.notes}
                      onChange={(e) => set('notes', e.target.value)}
                    />
                  </Field>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0a0e3a]/40 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">Publish to storefront</p>
                      <p className="text-xs text-white/50">Show this certificate on the shop product page</p>
                    </div>
                    <Switch checked={form.published} onCheckedChange={(v) => set('published', v)} />
                  </div>
                </Section>
              </div>

              <div className="space-y-3 lg:sticky lg:top-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white/70">Live preview</p>
                  {variant && (
                    <a
                      href={printHref(variant.id, editing?.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#9aa8ff] hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" /> Open full / download
                    </a>
                  )}
                </div>
                {preview && (
                  <CoaScaledPreview
                    data={preview}
                    blendContext={blendCtx(preview.compoundName)}
                  />
                )}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-white/10 px-5 py-3">
          {mode === 'form' ? (
            <>
              <Button
                variant="outline"
                onClick={() => setMode('list')}
                className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className="bg-brand-primary text-white hover:bg-[#1a30c0]"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? 'Save changes' : 'Create certificate'}
              </Button>
            </>
          ) : mode === 'view' ? (
            <>
              <Button
                variant="outline"
                onClick={() => setMode('list')}
                className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              {activeView && (
                <Button
                  onClick={() => startEdit(activeView)}
                  className="bg-brand-primary text-white hover:bg-[#1a30c0]"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit this certificate
                </Button>
              )}
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">{title}</h3>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-white/60">{label}</Label>
      {children}
    </div>
  )
}
