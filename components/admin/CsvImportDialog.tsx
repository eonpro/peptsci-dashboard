'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
import { Upload, Download, AlertCircle, Loader2, FileUp, CheckCircle2 } from 'lucide-react'

interface RowError {
  rowNumber: number
  message: string
}

interface ImportSummary {
  totalRows: number
  created: number
  updated: number
  failed: number
  errors: RowError[]
}

export interface PreviewColumn<Row> {
  header: string
  render: (row: Row) => React.ReactNode
  align?: 'left' | 'right'
}

interface CsvImportDialogProps<Row extends { rowNumber: number }> {
  /** Text on the trigger button. */
  label: string
  title: string
  description: React.ReactNode
  headers: readonly string[]
  templateText: string
  templateFilename: string
  /** POST endpoint that accepts { csv } and returns an ImportSummary. */
  endpoint: string
  /** Pure client-side parser for the live preview. */
  parse: (csv: string) => { rows: Row[]; errors: RowError[] }
  previewColumns: PreviewColumn<Row>[]
}

/**
 * Reusable admin "Import CSV" button + dialog. Mirrors the products import
 * dialog: drag/drop or pick a file, preview valid rows + per-row errors,
 * download a template, then POST the raw CSV. Refreshes the route on success
 * so server-rendered tables pick up the new rows.
 */
export function CsvImportDialog<Row extends { rowNumber: number }>({
  label,
  title,
  description,
  headers,
  templateText,
  templateFilename,
  endpoint,
  parse,
  previewColumns,
}: CsvImportDialogProps<Row>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<Row[]>([])
  const [previewErrors, setPreviewErrors] = useState<RowError[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function applyCsv(text: string) {
    setCsvText(text)
    setResult(null)
    const { rows, errors } = parse(text)
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
    const blob = new Blob([templateText], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = templateFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  function openDialog() {
    setCsvText('')
    setFileName(null)
    setPreviewRows([])
    setPreviewErrors([])
    setResult(null)
    setError(null)
    setOpen(true)
  }

  async function runImport() {
    if (previewRows.length === 0) return
    setImporting(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || 'Import failed')
      setResult(data as ImportSummary)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Button onClick={openDialog} className="bg-[#213cef] hover:bg-[#1a30c0] text-white">
        <Upload className="h-4 w-4 mr-2" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#050722] border-white/10 text-white sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">{title}</DialogTitle>
            <DialogDescription className="text-white/60">{description}</DialogDescription>
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
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/15 bg-[#0a0e3a]/40 px-4 py-8 text-center cursor-pointer hover:border-[#213cef]/60"
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
                <p className="text-white/40 text-xs mt-1">Columns: {headers.join(', ')}</p>
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
                          {previewColumns.map((c) => (
                            <TableHead
                              key={c.header}
                              className={`text-white/60 ${c.align === 'right' ? 'text-right' : ''}`}
                            >
                              {c.header}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.slice(0, 50).map((r) => (
                          <TableRow key={r.rowNumber} className="border-white/5">
                            {previewColumns.map((c) => (
                              <TableCell
                                key={c.header}
                                className={`text-white/80 ${c.align === 'right' ? 'text-right' : ''}`}
                              >
                                {c.render(r)}
                              </TableCell>
                            ))}
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
                className="bg-[#213cef] hover:bg-[#1a30c0] text-white"
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
                  disabled={previewRows.length === 0 || importing}
                  className="bg-[#213cef] hover:bg-[#1a30c0] text-white"
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
