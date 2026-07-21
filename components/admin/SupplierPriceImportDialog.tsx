'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Upload, Download, AlertCircle, Loader2, FileUp, CheckCircle2 } from 'lucide-react'
import {
  parseSupplierPriceCsv,
  supplierImportTemplate,
  SUPPLIER_IMPORT_HEADERS,
  type SupplierPriceRow,
  type RowError,
} from '@/lib/supplier-import'

interface ImportSummary {
  supplierName: string
  totalRows: number
  created: number
  updated: number
  failed: number
  errors: RowError[]
}

/**
 * "Import Price List" button + dialog for supplier price lists. Mirrors the
 * shared CsvImportDialog UX but adds the supplier-name field the endpoint
 * needs (items are upserted under that supplier). Used on the PO generator.
 */
export function SupplierPriceImportDialog({
  defaultSupplierName = '',
  onImported,
}: {
  defaultSupplierName?: string
  /** Called after a successful import so the caller can refresh its supplier list. */
  onImported?: (supplierName: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [supplierName, setSupplierName] = useState(defaultSupplierName)
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<SupplierPriceRow[]>([])
  const [previewErrors, setPreviewErrors] = useState<RowError[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function applyCsv(text: string) {
    setCsvText(text)
    setResult(null)
    const { rows, errors } = parseSupplierPriceCsv(text)
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
    const blob = new Blob([supplierImportTemplate()], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'peptsci-supplier-price-list-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function openDialog() {
    setSupplierName(defaultSupplierName)
    setCsvText('')
    setFileName(null)
    setPreviewRows([])
    setPreviewErrors([])
    setResult(null)
    setError(null)
    setOpen(true)
  }

  async function runImport() {
    if (previewRows.length === 0 || !supplierName.trim()) return
    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/suppliers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierName: supplierName.trim(), csv: csvText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Import failed')
      setResult(data as ImportSummary)
      onImported?.(supplierName.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={openDialog}>
        <Upload className="h-4 w-4 mr-2" />
        Import Price List
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-brand-onyx border-white/10 text-white sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Import Supplier Price List (CSV)</DialogTitle>
            <DialogDescription className="text-white/60">
              Upload a manufacturer price sheet as-is (e.g.{' '}
              <span className="text-white/80">Cat.No, Name, Specification, Vials Per Box,
              Box/Per-Vial prices</span>). Discounted (&quot;-10%&quot;) columns are used as your
              cost. Re-importing the same supplier updates prices in place.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {result ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                <span>
                  {result.supplierName}: import complete — {result.created} created,{' '}
                  {result.updated} updated
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
              <div>
                <label className="text-sm text-white/70 mb-1 block">Supplier name</label>
                <Input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. Crest Peptide"
                  className="bg-[#0a0e3a]/40 border-white/15 text-white placeholder:text-white/30"
                />
              </div>

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
                  Columns: {SUPPLIER_IMPORT_HEADERS.join(', ')}
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
                          <TableHead className="text-white/60">Cat.No</TableHead>
                          <TableHead className="text-white/60">Product</TableHead>
                          <TableHead className="text-white/60">Dose</TableHead>
                          <TableHead className="text-white/60 text-right">Per-Vial Cost</TableHead>
                          <TableHead className="text-white/60 text-right">List</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.slice(0, 50).map((r) => (
                          <TableRow key={r.rowNumber} className="border-white/5">
                            <TableCell className="text-white/80">{r.supplierSku}</TableCell>
                            <TableCell className="text-white/80">{r.productName}</TableCell>
                            <TableCell className="text-white/80">{r.dose || '—'}</TableCell>
                            <TableCell className="text-white/80 text-right">
                              ${r.unitCost.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-white/50 text-right">
                              {r.listPrice !== undefined ? `$${r.listPrice.toFixed(2)}` : '—'}
                            </TableCell>
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
                onClick={() => setOpen(false)}
                className="bg-brand-primary hover:bg-[#1a30c0] text-white"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={runImport}
                  disabled={previewRows.length === 0 || !supplierName.trim() || importing}
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
    </>
  )
}
