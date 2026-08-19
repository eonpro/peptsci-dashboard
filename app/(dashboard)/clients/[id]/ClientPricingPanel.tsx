'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRole } from '@/hooks/useRole'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiError } from '@/lib/api-error'
import { resolveEffectiveUnitPrice } from '@/lib/access'
import {
  clientPricingImportTemplate,
  parseClientPricingCsv,
  type ClientPricingImportRow,
  type RowError,
} from '@/lib/client-pricing-import'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  FileUp,
  Loader2,
  Search,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react'

interface PriceRow {
  variantId: string
  variantSku: string
  productName: string
  dose: string
  unitCost: number
  standardPrice: number
  customPrice: number | null
  discountPercent: number | null
  notes: string | null
}

interface ImportSummary {
  clientId: string
  totalRows: number
  created: number
  updated: number
  cleared: number
  failed: number
  errors: RowError[]
}

interface CopySourceClient {
  id: string
  organizationName: string
  paysAtCost: boolean
  customPriceCount: number
}

interface ClientPricingPanelProps {
  clientId: string
  organizationName: string
  onPricingChanged?: (customCount: number) => void
}

function formatMoney(n: number) {
  return `$${n.toFixed(2)}`
}

export function ClientPricingPanel({
  clientId,
  organizationName,
  onPricingChanged,
}: ClientPricingPanelProps) {
  const { isSuperAdmin } = useRole()
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [paysAtCost, setPaysAtCost] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [togglingAtCost, setTogglingAtCost] = useState(false)
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null)
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({})
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})

  // CSV import dialog state
  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<ClientPricingImportRow[]>([])
  const [previewErrors, setPreviewErrors] = useState<RowError[]>([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [copyOpen, setCopyOpen] = useState(false)
  const [copySources, setCopySources] = useState<CopySourceClient[]>([])
  const [copySourcesLoading, setCopySourcesLoading] = useState(false)
  const [copySourceId, setCopySourceId] = useState('')
  const [copying, setCopying] = useState(false)

  const loadPricing = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/client-pricing?clientId=${encodeURIComponent(clientId)}&full=1`
      )
      if (!res.ok) throw await apiError(res, 'Failed to load pricing')
      const data = await res.json()
      const rows: PriceRow[] = Array.isArray(data?.prices) ? data.prices : []
      setPrices(rows)
      setPaysAtCost(Boolean(data?.paysAtCost))
      const drafts: Record<string, string> = {}
      const notes: Record<string, string> = {}
      for (const row of rows) {
        drafts[row.variantId] =
          row.customPrice != null && row.customPrice > 0 ? String(row.customPrice) : ''
        notes[row.variantId] = row.notes ?? ''
      }
      setDraftPrices(drafts)
      setDraftNotes(notes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pricing')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    void loadPricing()
  }, [loadPricing])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return prices
    return prices.filter(
      (p) =>
        p.productName.toLowerCase().includes(q) ||
        p.variantSku.toLowerCase().includes(q) ||
        (p.dose || '').toLowerCase().includes(q)
    )
  }, [prices, search])

  const onPricingChangedRef = useRef(onPricingChanged)
  onPricingChangedRef.current = onPricingChanged

  const customCount = useMemo(
    () => prices.filter((p) => p.customPrice != null && p.customPrice > 0).length,
    [prices]
  )

  useEffect(() => {
    onPricingChangedRef.current?.(customCount)
  }, [customCount])

  const handlePaysAtCostChange = async (value: boolean) => {
    if (!isSuperAdmin) return
    setTogglingAtCost(true)
    setError(null)
    const prev = paysAtCost
    setPaysAtCost(value)
    try {
      const res = await fetch(`/api/admin/clients/${encodeURIComponent(clientId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paysAtCost: value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Failed to update at-cost pricing')
      }
    } catch (e) {
      setPaysAtCost(prev)
      setError(e instanceof Error ? e.message : 'Failed to update at-cost pricing')
    } finally {
      setTogglingAtCost(false)
    }
  }

  const savePrice = async (row: PriceRow) => {
    if (!isSuperAdmin) return
    const raw = (draftPrices[row.variantId] ?? '').trim()
    const notesRaw = (draftNotes[row.variantId] ?? '').trim()

    // Unchanged empty → no-op when there was no custom price
    if (!raw) {
      if (row.customPrice == null) return
      await clearPrice(row)
      return
    }

    const customPrice = parseFloat(raw)
    if (!Number.isFinite(customPrice) || customPrice <= 0) {
      setError(`Enter a valid price greater than zero for ${row.variantSku}`)
      return
    }

    if (
      row.customPrice === customPrice &&
      (row.notes ?? '') === notesRaw
    ) {
      return
    }

    setSavingVariantId(row.variantId)
    setError(null)
    try {
      const res = await fetch('/api/admin/client-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          variantId: row.variantId,
          customPrice,
          notes: notesRaw || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Failed to save pricing')
      }
      setPrices((prev) =>
        prev.map((p) =>
          p.variantId === row.variantId
            ? {
                ...p,
                customPrice,
                notes: notesRaw || null,
                discountPercent:
                  row.standardPrice > 0
                    ? Number((((row.standardPrice - customPrice) / row.standardPrice) * 100).toFixed(2))
                    : null,
              }
            : p
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save pricing')
      setDraftPrices((d) => ({
        ...d,
        [row.variantId]:
          row.customPrice != null && row.customPrice > 0 ? String(row.customPrice) : '',
      }))
    } finally {
      setSavingVariantId(null)
    }
  }

  const clearPrice = async (row: PriceRow) => {
    if (!isSuperAdmin) return
    setSavingVariantId(row.variantId)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/client-pricing?clientId=${encodeURIComponent(clientId)}&variantId=${encodeURIComponent(row.variantId)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || body.error || 'Failed to clear pricing')
      }
      setPrices((prev) =>
        prev.map((p) =>
          p.variantId === row.variantId
            ? { ...p, customPrice: null, discountPercent: null, notes: null }
            : p
        )
      )
      setDraftPrices((d) => ({ ...d, [row.variantId]: '' }))
      setDraftNotes((d) => ({ ...d, [row.variantId]: '' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear pricing')
    } finally {
      setSavingVariantId(null)
    }
  }

  const exportCsv = () => {
    // Same columns clinics upload: sku (product name), Strength, custom_price
    const header = ['sku', 'Strength', 'custom_price']
    const lines = [
      header.join(','),
      ...prices.map((p) =>
        [
          `"${p.productName.replace(/"/g, '""')}"`,
          p.dose || '',
          p.customPrice != null ? `$${p.customPrice.toFixed(0)}` : '',
        ].join(',')
      ),
    ]
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `client-pricing-${organizationName.replace(/\s+/g, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function applyCsv(text: string) {
    setCsvText(text)
    setImportResult(null)
    const { rows, errors } = parseClientPricingCsv(text)
    setPreviewRows(rows)
    setPreviewErrors(errors)
  }

  function handleFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => applyCsv(String(reader.result || ''))
    reader.readAsText(file)
  }

  function downloadTemplate() {
    const blob = new Blob([clientPricingImportTemplate()], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'peptsci-client-pricing-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function openCopy() {
    setCopyOpen(true)
    setCopySourceId('')
    setCopySourcesLoading(true)
    try {
      const res = await fetch('/api/admin/clients')
      if (!res.ok) throw await apiError(res, 'Failed to load clients')
      const data = await res.json()
      const list: CopySourceClient[] = (data.clients ?? [])
        .filter((c: CopySourceClient) => c.id !== clientId)
        .map((c: CopySourceClient) => ({
          id: c.id,
          organizationName: c.organizationName,
          paysAtCost: Boolean(c.paysAtCost),
          customPriceCount: Number(c.customPriceCount ?? 0),
        }))
      setCopySources(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load clients')
      setCopyOpen(false)
    } finally {
      setCopySourcesLoading(false)
    }
  }

  async function runCopy() {
    if (!copySourceId) return
    setCopying(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/client-pricing/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceClientId: copySourceId,
          targetClientId: clientId,
          replace: true,
          copyPaysAtCost: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || 'Failed to copy pricing')
      const sourceName =
        copySources.find((c) => c.id === copySourceId)?.organizationName ?? 'the other client'
      toast.success(
        `Copied ${data.copied ?? 0} price${data.copied === 1 ? '' : 's'} from ${sourceName}` +
          (data.cleared ? `, cleared ${data.cleared}` : '')
      )
      setCopyOpen(false)
      await loadPricing()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to copy pricing')
    } finally {
      setCopying(false)
    }
  }

  function openImport() {
    setCsvText('')
    setFileName(null)
    setPreviewRows([])
    setPreviewErrors([])
    setImportResult(null)
    setImportError(null)
    setImportOpen(true)
  }

  async function runImport() {
    if (previewRows.length === 0) return
    setImporting(true)
    setImportError(null)
    try {
      const res = await fetch('/api/admin/client-pricing/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, csv: csvText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Import failed')
      setImportResult(data as ImportSummary)
      await loadPricing()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card id="client-pricing" className="bg-[#0a0e3a]/50 border-white/10 scroll-mt-24">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <Tag className="h-4 w-4" />
              Custom Pricing
            </CardTitle>
            <CardDescription className="text-white/50">
              All catalog products with retail (SRP) and a field to type this
              clinic&apos;s offer price. Copy another client&apos;s model to start
              from an existing sheet.
              {customCount > 0
                ? ` ${customCount} custom SKU${customCount === 1 ? '' : 's'} set.`
                : ' Catalog SRP applies until a custom price is set.'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {isSuperAdmin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/15 text-white hover:bg-white/10"
                onClick={() => void openCopy()}
                disabled={loading}
              >
                <Copy className="h-4 w-4 mr-1.5" />
                Copy from client
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/15 text-white hover:bg-white/10"
              onClick={exportCsv}
              disabled={loading || prices.length === 0}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
            {isSuperAdmin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/15 text-white hover:bg-white/10"
                onClick={openImport}
                disabled={loading}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                Upload CSV
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product or SKU"
              className="pl-9 bg-[#0a0e3a]/40 border-white/15 text-white placeholder:text-white/30"
            />
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2">
            <div className="min-w-0">
              <Label className="text-white text-sm">Clinic pays cost</Label>
              <p className="text-xs text-white/45">
                Every vial at our unit cost — overrides custom prices and SRP.
              </p>
            </div>
            <Switch
              checked={paysAtCost}
              disabled={!isSuperAdmin || togglingAtCost || loading}
              onCheckedChange={handlePaysAtCostChange}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading catalog…
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 overflow-x-auto max-h-[560px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">Product</TableHead>
                  <TableHead className="text-white/60">SKU</TableHead>
                  <TableHead className="text-white/60 text-right">Retail</TableHead>
                  <TableHead className="text-white/60 text-right">Custom / Offer</TableHead>
                  <TableHead className="text-white/60 text-right">Discount</TableHead>
                  <TableHead className="text-white/60">Effective</TableHead>
                  <TableHead className="text-white/60">Notes</TableHead>
                  {isSuperAdmin && <TableHead className="text-white/60 w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow className="border-white/10">
                    <TableCell
                      colSpan={isSuperAdmin ? 8 : 7}
                      className="text-center text-white/50 py-8"
                    >
                      No products match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => {
                    const effective = resolveEffectiveUnitPrice({
                      srp: row.standardPrice,
                      customPrice: row.customPrice,
                      unitCost: row.unitCost,
                      paysAtCost,
                    })
                    const discount =
                      row.customPrice != null &&
                      row.customPrice > 0 &&
                      row.standardPrice > 0
                        ? ((row.standardPrice - row.customPrice) / row.standardPrice) * 100
                        : null
                    const saving = savingVariantId === row.variantId

                    return (
                      <TableRow key={row.variantId} className="border-white/10">
                        <TableCell className="text-white">
                          <div className="font-medium">{row.productName}</div>
                          {row.dose ? (
                            <div className="text-xs text-white/45">{row.dose}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-white/70 font-mono text-xs">
                          {row.variantSku}
                        </TableCell>
                        <TableCell className="text-right text-white/80">
                          {formatMoney(row.standardPrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          {isSuperAdmin ? (
                            <div className="inline-flex items-center gap-1 justify-end">
                              <span className="text-white/40 text-xs">$</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={draftPrices[row.variantId] ?? ''}
                                disabled={saving || paysAtCost}
                                onChange={(e) =>
                                  setDraftPrices((d) => ({
                                    ...d,
                                    [row.variantId]: e.target.value,
                                  }))
                                }
                                onBlur={() => void savePrice(row)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur()
                                  }
                                }}
                                className="h-8 w-24 text-right bg-[#0a0e3a]/40 border-white/15 text-white"
                                placeholder="—"
                              />
                              {saving && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-white/50" />
                              )}
                            </div>
                          ) : (
                            <span className="text-white">
                              {row.customPrice != null
                                ? formatMoney(row.customPrice)
                                : '—'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-white/60 text-sm">
                          {discount != null && Number.isFinite(discount)
                            ? `${discount.toFixed(1)}%`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <span className="text-white text-sm">
                              {formatMoney(effective.price)}
                            </span>
                            {effective.isAtCost ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 text-amber-300 text-[10px]"
                              >
                                At cost
                              </Badge>
                            ) : effective.isCustom ? (
                              <Badge
                                variant="outline"
                                className="border-green-500/40 text-green-300 text-[10px]"
                              >
                                Custom
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-white/20 text-white/50 text-[10px]"
                              >
                                SRP
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isSuperAdmin ? (
                            <Input
                              value={draftNotes[row.variantId] ?? ''}
                              disabled={saving || paysAtCost}
                              onChange={(e) =>
                                setDraftNotes((d) => ({
                                  ...d,
                                  [row.variantId]: e.target.value,
                                }))
                              }
                              onBlur={() => void savePrice(row)}
                              className="h-8 min-w-[120px] bg-[#0a0e3a]/40 border-white/15 text-white placeholder:text-white/30"
                              placeholder="—"
                            />
                          ) : (
                            <span className="text-white/60 text-sm">{row.notes || '—'}</span>
                          )}
                        </TableCell>
                        {isSuperAdmin && (
                          <TableCell>
                            {row.customPrice != null && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                disabled={saving || paysAtCost}
                                onClick={() => void clearPrice(row)}
                                title="Clear custom price"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!isSuperAdmin && !loading && (
          <p className="text-xs text-white/40">
            View only — super admin required to edit prices or upload CSV.
          </p>
        )}
      </CardContent>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-white">Copy pricing model</DialogTitle>
            <DialogDescription className="text-white/60">
              Replace {organizationName}&apos;s custom prices with another clinic&apos;s
              full model. SKUs the source does not price will be cleared. The
              &ldquo;clinic pays cost&rdquo; flag is copied too.
            </DialogDescription>
          </DialogHeader>

          {copySourcesLoading ? (
            <div className="flex items-center justify-center py-8 text-white/50">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading clients…
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-white/80">Copy from</Label>
                <Select value={copySourceId} onValueChange={setCopySourceId}>
                  <SelectTrigger className="bg-[#0a0e3a] border-white/10 text-white">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent className="bg-brand-onyx border-white/10 max-h-[300px]">
                    {copySources
                      .slice()
                      .sort((a, b) => {
                        const aRank = a.customPriceCount + (a.paysAtCost ? 1 : 0)
                        const bRank = b.customPriceCount + (b.paysAtCost ? 1 : 0)
                        if (bRank !== aRank) return bRank - aRank
                        return a.organizationName.localeCompare(b.organizationName)
                      })
                      .map((c) => (
                        <SelectItem
                          key={c.id}
                          value={c.id}
                          className="text-white focus:bg-white/10 focus:text-white"
                        >
                          {c.organizationName}
                          {c.customPriceCount > 0
                            ? ` · ${c.customPriceCount} SKU${c.customPriceCount === 1 ? '' : 's'}`
                            : ''}
                          {c.paysAtCost ? ' · pays cost' : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {copySourceId ? (
                <p className="text-sm text-amber-200/90">
                  This overwrites every custom price on {organizationName}.
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-white/15 text-white"
              onClick={() => setCopyOpen(false)}
              disabled={copying}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={copying || !copySourceId || copySourcesLoading}
              onClick={() => void runCopy()}
              className="bg-brand-primary hover:bg-[#1a30c0] text-white"
            >
              {copying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Copying…
                </>
              ) : (
                'Copy pricing'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Upload Client Pricing (CSV)</DialogTitle>
            <DialogDescription className="text-white/60">
              Required columns:{' '}
              <span className="text-white/80">sku, Strength, custom_price</span>.{' '}
              <span className="text-white/80">sku</span> is the product name;{' '}
              <span className="text-white/80">Strength</span> is the milligram/dose (e.g. 5mg vs
              10mg). Same name with different Strengths is expected and maps to different
              vials. Leave custom_price blank to clear. Applies to {organizationName}.
            </DialogDescription>
          </DialogHeader>

          {importError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4" />
              {importError}
            </div>
          )}

          {importResult ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                <span>
                  Import complete — {importResult.created} created, {importResult.updated}{' '}
                  updated, {importResult.cleared} cleared
                  {importResult.failed > 0 ? `, ${importResult.failed} failed` : ''}.
                </span>
              </div>
              {importResult.errors.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 max-h-48 overflow-y-auto text-sm text-amber-200">
                  <p className="font-medium mb-1">Rows that need attention:</p>
                  <ul className="space-y-1">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>
                        Row {e.rowNumber}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/15 bg-[#0a0e3a]/40 px-4 py-8 text-center cursor-pointer hover:border-brand-primary/60"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
              >
                <FileUp className="h-7 w-7 text-white/40 mb-2" />
                <p className="text-white/80 text-sm">
                  {fileName ? (
                    <span className="text-white">{fileName}</span>
                  ) : (
                    'Click to choose a .csv file or drag it here'
                  )}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-white/60 hover:text-white"
                onClick={downloadTemplate}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Download template
              </Button>

              {(previewRows.length > 0 || previewErrors.length > 0) && (
                <div className="space-y-2">
                  <p className="text-sm text-white/70">
                    Preview: {previewRows.length} valid row
                    {previewRows.length === 1 ? '' : 's'}
                    {previewErrors.length > 0
                      ? `, ${previewErrors.length} error${previewErrors.length === 1 ? '' : 's'}`
                      : ''}
                  </p>
                  {previewErrors.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 max-h-32 overflow-y-auto text-sm text-amber-200">
                      {previewErrors.slice(0, 8).map((e, i) => (
                        <div key={i}>
                          Row {e.rowNumber}: {e.message}
                        </div>
                      ))}
                    </div>
                  )}
                  {previewRows.length > 0 && (
                    <div className="rounded-lg border border-white/10 max-h-48 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="text-white/60">sku</TableHead>
                            <TableHead className="text-white/60">Strength</TableHead>
                            <TableHead className="text-white/60">custom_price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewRows.slice(0, 20).map((r) => (
                            <TableRow key={r.rowNumber} className="border-white/10">
                              <TableCell className="text-white text-sm">{r.sku}</TableCell>
                              <TableCell className="text-white/80 text-sm">
                                {r.strength}
                              </TableCell>
                              <TableCell className="text-white">
                                {r.clear
                                  ? 'Clear'
                                  : r.customPrice != null
                                    ? formatMoney(r.customPrice)
                                    : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {importResult ? (
              <Button
                type="button"
                onClick={() => setImportOpen(false)}
                className="bg-brand-primary hover:bg-[#1a30c0] text-white"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/15 text-white"
                  onClick={() => setImportOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={importing || previewRows.length === 0}
                  onClick={() => void runImport()}
                  className="bg-brand-primary hover:bg-[#1a30c0] text-white"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    `Import ${previewRows.length} row${previewRows.length === 1 ? '' : 's'}`
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
