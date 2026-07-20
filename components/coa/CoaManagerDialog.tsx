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
  Eye,
  EyeOff,
  FileUp,
  AlertCircle,
} from 'lucide-react'
import { CoaCertificate } from '@/components/coa/CoaCertificate'
import type { CoaData } from '@/lib/coa'
import { apiError } from '@/lib/api-error'

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

function emptyForm(variant: CoaVariantRef): CoaForm {
  return {
    compoundName: variant.productName || '',
    doseLabel: variant.dose || '',
    casNumber: '',
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
    assayLabelClaimMg: '',
    identitySpec: '',
    identityResult: '',
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

/** Build a preview CoaData object from live form values. */
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
  const [mode, setMode] = useState<'list' | 'form'>('list')
  const [editing, setEditing] = useState<CoaData | null>(null)
  const [form, setForm] = useState<CoaForm | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileObjectUrl, setFileObjectUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
      load()
    }
  }, [open, variant, load])

  // Revoke preview object URLs to avoid leaks.
  useEffect(() => {
    return () => {
      if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl)
    }
  }, [fileObjectUrl])

  function startAdd() {
    if (!variant) return
    setEditing(null)
    setForm(emptyForm(variant))
    setFile(null)
    if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl)
    setFileObjectUrl(null)
    setMode('form')
  }

  function startEdit(coa: CoaData) {
    setEditing(coa)
    setForm(coaToForm(coa))
    setFile(null)
    if (fileObjectUrl) URL.revokeObjectURL(fileObjectUrl)
    setFileObjectUrl(null)
    setMode('form')
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[980px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            Certificates of Analysis
            {variant ? (
              <span className="text-white/50 font-normal">
                {' '}
                — {variant.productName}
                {variant.dose ? ` · ${variant.dose}` : ''}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {mode === 'list'
              ? 'Upload the supplier certificate and enter the results. Published certificates appear on the storefront product page.'
              : 'Enter the values exactly as reported on the supplier certificate. The preview updates live.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {mode === 'list' ? (
          <div className="space-y-4 py-2">
            <div className="flex justify-end">
              <Button onClick={startAdd} className="bg-brand-primary hover:bg-[#1a30c0] text-white">
                <Plus className="h-4 w-4 mr-2" />
                Add Certificate
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-white/60">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
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
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium truncate">
                          {coa.batchNumber ? `Batch ${coa.batchNumber}` : 'Unbatched'}
                        </span>
                        {coa.published ? (
                          <Badge className="bg-green-500/15 text-green-400 border-green-500/30">
                            Published
                          </Badge>
                        ) : (
                          <Badge className="bg-white/10 text-white/60 border-white/20">Draft</Badge>
                        )}
                        {coa.hasFile && (
                          <Badge className="bg-brand-primary/15 text-[#7d90ff] border-brand-primary/30">
                            Source doc
                          </Badge>
                        )}
                      </div>
                      <div className="text-white/50 text-xs mt-0.5">
                        {coa.purityPercent != null ? `${coa.purityPercent}% purity` : 'No purity'}
                        {coa.analyzedOn
                          ? ` · analyzed ${new Date(coa.analyzedOn).toLocaleDateString()}`
                          : ''}
                        {coa.issuingLab ? ` · ${coa.issuingLab}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
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
        ) : form ? (
          <div className="grid gap-6 py-2 lg:grid-cols-2">
            {/* Form */}
            <div className="space-y-5">
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
                  <Field label="Label claim (mg)">
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
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/15 bg-[#0a0e3a]/40 px-4 py-5 text-center cursor-pointer hover:border-brand-primary/60"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const f = e.dataTransfer.files?.[0]
                      if (f) onFilePicked(f)
                    }}
                  >
                    <FileUp className="h-5 w-5 text-white/40 mb-1" />
                    <p className="text-white/80 text-sm">
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
                    <p className="text-white text-sm font-medium">Publish to storefront</p>
                    <p className="text-white/50 text-xs">
                      Show this certificate on the shop product page
                    </p>
                  </div>
                  <Switch
                    checked={form.published}
                    onCheckedChange={(v) => set('published', v)}
                  />
                </div>
              </Section>
            </div>

            {/* Live preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-white/70 text-sm font-medium">Live preview</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview((p) => !p)}
                  className="text-white/60 hover:text-white hover:bg-white/10"
                >
                  {showPreview ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-1" /> Hide
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-1" /> Show
                    </>
                  )}
                </Button>
              </div>
              {showPreview && preview && (
                <div className="rounded-lg border border-white/10 bg-[#c8ccda] p-3 overflow-x-auto">
                  <div style={{ width: 816, transformOrigin: 'top left' }}>
                    <CoaCertificate data={preview} logoSrc="/brand/peptsci-logo-dark.png" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {mode === 'form' ? (
            <>
              <Button
                variant="outline"
                onClick={() => setMode('list')}
                className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className="bg-brand-primary hover:bg-[#1a30c0] text-white"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? 'Save changes' : 'Create certificate'}
              </Button>
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
      <Label className="text-white/60 text-xs">{label}</Label>
      {children}
    </div>
  )
}
