'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Upload,
  Download,
  Search,
  AlertCircle,
  Loader2,
  Boxes,
  Factory,
  DollarSign,
  CheckCircle2,
  FileUp,
  Trash2,
} from 'lucide-react'
import {
  parseProductCsv,
  productImportTemplate,
  PRODUCT_IMPORT_HEADERS,
  type ProductImportRow,
  type RowError,
} from '@/lib/product-import'

interface VariantRow {
  id: string
  sku: string | null
  productName: string
  category: string | null
  dose: string | null
  srp: number
  unitCost: number
  supplierName: string | null
  supplierSku: string | null
  inventoryOnHand: number
}

interface ImportSummary {
  totalRows: number
  created: number
  updated: number
  failed: number
  errors: RowError[]
}

const inputClass = 'bg-[#0a0e3a] border-white/10 text-white'

export default function ProductsPage() {
  const [variants, setVariants] = useState<VariantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<ProductImportRow[]>([])
  const [previewErrors, setPreviewErrors] = useState<RowError[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/products')
      if (!res.ok) throw new Error('Failed to load products')
      const data = await res.json()
      setVariants(Array.isArray(data?.variants) ? data.variants : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products')
      setVariants([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const products = new Set(variants.map((v) => v.productName.toLowerCase()))
    const suppliers = new Set(
      variants.map((v) => (v.supplierName || '').toLowerCase()).filter(Boolean)
    )
    return { products: products.size, variants: variants.length, suppliers: suppliers.size }
  }, [variants])

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase()
    return variants.filter(
      (v) =>
        v.productName.toLowerCase().includes(term) ||
        (v.sku || '').toLowerCase().includes(term) ||
        (v.supplierName || '').toLowerCase().includes(term) ||
        (v.supplierSku || '').toLowerCase().includes(term)
    )
  }, [variants, searchTerm])

  function applyCsv(text: string) {
    setCsvText(text)
    setResult(null)
    const { rows, errors } = parseProductCsv(text)
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
    const blob = new Blob([productImportTemplate()], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'peptsci-product-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function openImport() {
    setCsvText('')
    setFileName(null)
    setPreviewRows([])
    setPreviewErrors([])
    setResult(null)
    setImportOpen(true)
  }

  async function runImport() {
    if (previewRows.length === 0) return
    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Import failed')
      setResult(data as ImportSummary)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function deleteVariant(v: VariantRow) {
    const ok = window.confirm(
      `Delete "${v.productName}"${v.sku ? ` (${v.sku})` : ''}? This cannot be undone.`
    )
    if (!ok) return
    setDeletingId(v.id)
    setError(null)
    // Optimistically remove the row so it can't reappear from a stale fetch.
    setVariants((prev) => prev.filter((x) => x.id !== v.id))
    try {
      const res = await fetch(`/api/admin/products/${v.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to delete product')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete product')
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Products</h1>
          <p className="text-white/60 text-sm">
            Your catalog and how you buy each item from the manufacturer
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={downloadTemplate}
            className="border-white/20 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <Download className="h-4 w-4 mr-2" />
            CSV Template
          </Button>
          <Button onClick={openImport} className="bg-brand-primary hover:bg-[#1a30c0] text-white">
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Products" value={stats.products} icon={Boxes} color="text-[#5B8BFF]" />
        <StatCard label="Variants / SKUs" value={stats.variants} icon={DollarSign} color="text-green-400" />
        <StatCard label="Suppliers" value={stats.suppliers} icon={Factory} color="text-amber-400" />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <Input
          placeholder="Search product, SKU, or supplier..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/40"
        />
      </div>

      {/* Table */}
      <Card className="bg-[#0a0e3a]/50 border-white/10 overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/60">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading products...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="bg-white/5 p-4 rounded-full mb-4">
                <Boxes className="h-8 w-8 text-white/40" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No products yet</h3>
              <p className="text-white/50 text-center max-w-md mb-6">
                Import your full catalog and manufacturer purchasing terms from a CSV file.
              </p>
              <Button onClick={openImport} className="bg-brand-primary hover:bg-[#1a30c0] text-white">
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/60">Product</TableHead>
                  <TableHead className="text-white/60">SKU</TableHead>
                  <TableHead className="text-white/60">Dose</TableHead>
                  <TableHead className="text-white/60 text-right">Cost</TableHead>
                  <TableHead className="text-white/60 text-right">SRP</TableHead>
                  <TableHead className="text-white/60">Supplier</TableHead>
                  <TableHead className="text-white/60">Supplier SKU</TableHead>
                  <TableHead className="text-white/60 text-right">On Hand</TableHead>
                  <TableHead className="text-white/60 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id} className="border-white/5 hover:bg-white/5">
                    <TableCell className="text-white font-medium">{v.productName}</TableCell>
                    <TableCell className="text-white/60">{v.sku || '-'}</TableCell>
                    <TableCell className="text-white/60">{v.dose || '-'}</TableCell>
                    <TableCell className="text-white/70 text-right">
                      ${v.unitCost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-green-400 text-right font-semibold">
                      ${v.srp.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-white/70">{v.supplierName || '-'}</TableCell>
                    <TableCell className="text-white/60">{v.supplierSku || '-'}</TableCell>
                    <TableCell className="text-white/70 text-right">{v.inventoryOnHand}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete product"
                        disabled={deletingId === v.id}
                        onClick={() => deleteVariant(v)}
                        className="h-8 w-8 text-white/50 hover:bg-red-500/10 hover:text-red-400"
                      >
                        {deletingId === v.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Bulk Import Products (CSV)</DialogTitle>
            <DialogDescription className="text-white/60">
              Required columns: <span className="text-white/80">name, sku</span>. Optional:
              unitCost, srp, dose, category, supplierName, supplierSku, inventoryOnHand,
              reorderLevel. Rows are matched to existing variants by{' '}
              <span className="text-white/80">SKU</span> (updated if found, created if new).
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                <span>
                  Import complete — {result.created} created, {result.updated} updated
                  {result.failed > 0 ? `, ${result.failed} failed` : ''}.
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 max-h-48 overflow-y-auto text-sm text-amber-200">
                  <p className="font-medium mb-1">Rows that need attention:</p>
                  <ul className="space-y-1">
                    {result.errors.map((e, i) => (
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
              {/* Upload zone */}
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
                <p className="text-white/40 text-xs mt-1">
                  Columns: {PRODUCT_IMPORT_HEADERS.join(', ')}
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

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="text-[#5B8BFF] hover:underline inline-flex items-center gap-1"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download template
                </button>
                {(previewRows.length > 0 || previewErrors.length > 0) && (
                  <span className="text-white/60">
                    {previewRows.length} valid row{previewRows.length !== 1 ? 's' : ''}
                    {previewErrors.length > 0 ? `, ${previewErrors.length} with errors` : ''}
                  </span>
                )}
              </div>

              {previewErrors.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 max-h-40 overflow-y-auto text-sm text-amber-200">
                  <ul className="space-y-1">
                    {previewErrors.map((e, i) => (
                      <li key={i}>
                        Row {e.rowNumber}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {previewRows.length > 0 && (
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  <div className="max-h-56 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                          <TableHead className="text-white/60">Product</TableHead>
                          <TableHead className="text-white/60">SKU</TableHead>
                          <TableHead className="text-white/60 text-right">Cost</TableHead>
                          <TableHead className="text-white/60 text-right">SRP</TableHead>
                          <TableHead className="text-white/60">Supplier</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.slice(0, 50).map((r) => (
                          <TableRow key={r.rowNumber} className="border-white/5">
                            <TableCell className="text-white">{r.name}</TableCell>
                            <TableCell className="text-white/60">{r.sku}</TableCell>
                            <TableCell className="text-white/70 text-right">
                              ${r.unitCost.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-green-400 text-right">
                              ${r.srp.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-white/60">{r.supplierName || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {previewRows.length > 50 && (
                    <p className="text-white/40 text-xs px-3 py-2 border-t border-white/10">
                      Showing first 50 of {previewRows.length} rows. All will be imported.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button
                onClick={() => setImportOpen(false)}
                className="bg-brand-primary hover:bg-[#1a30c0] text-white"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setImportOpen(false)}
                  className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={runImport}
                  disabled={previewRows.length === 0 || importing}
                  className="bg-brand-primary hover:bg-[#1a30c0] text-white"
                >
                  {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Import {previewRows.length > 0 ? `${previewRows.length} row(s)` : ''}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  return (
    <Card className="bg-[#0a0e3a]/50 border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-white/60">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Icon className={`h-5 w-5 ${color}`} />
          <span className="text-2xl font-bold text-white">{value}</span>
        </div>
      </CardContent>
    </Card>
  )
}
