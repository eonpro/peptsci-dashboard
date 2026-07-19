'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CoaCertificate } from '@/components/coa/CoaCertificate'
import type { CoaData } from '@/lib/coa'
import { cn } from '@/lib/utils'
import { Loader2, FileText, Download, ExternalLink } from 'lucide-react'

interface CoaDialogProps {
  sku: string
  productName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Lazy COA viewer: fetches published certificates for a SKU on open and shows
 * ONE certificate at a time in a fixed-height modal (header + tab bar stay
 * put; only the certificate scrolls). Blends expose a tab per component
 * peptide. "Download PDF" opens the print-optimized view of the current
 * certificate in a new tab, which auto-triggers the browser's Save-as-PDF
 * dialog.
 */
export function CoaDialog({ sku, productName, open, onOpenChange }: CoaDialogProps) {
  const [coas, setCoas] = useState<CoaData[] | null>(null)
  const [error, setError] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    if (!open) return
    setCoas(null)
    setError(false)
    setActiveIdx(0)
    let active = true
    fetch(`/api/shop/coa?sku=${encodeURIComponent(sku)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active) return
        if (data?.coas) setCoas(data.coas)
        else setError(true)
      })
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [open, sku])

  const activeCoa = coas && coas.length > 0 ? coas[Math.min(activeIdx, coas.length - 1)] : null
  const printHref = `/shop/product/${encodeURIComponent(sku)}/coa/print${
    activeCoa ? `?coa=${encodeURIComponent(activeCoa.id)}` : ''
  }`

  const tabLabel = (coa: CoaData) =>
    [coa.compoundName, coa.doseLabel].filter(Boolean).join(' · ')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[min(960px,96vw)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-white/10 bg-brand-onyx p-0">
        {/* Fixed header: title + actions (kept clear of the close button). */}
        <DialogHeader className="shrink-0 border-b border-white/10 bg-brand-onyx px-5 py-4 pr-14">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle className="flex min-w-0 items-center gap-2 text-white">
              <FileText className="h-5 w-5 shrink-0 text-brand-primary" />
              <span className="truncate">Certificate of Analysis — {productName}</span>
            </DialogTitle>
            {activeCoa && (
              <div className="flex items-center gap-2">
                {activeCoa.hasFile && activeCoa.fileUrl && (
                  <a
                    href={activeCoa.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Original
                  </a>
                )}
                <a
                  href={printHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1a30c0]"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </a>
              </div>
            )}
          </div>

          {/* One tab per certificate (blends carry a COA per component). */}
          {coas && coas.length > 1 && (
            <div className="-mb-1 mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {coas.map((coa, i) => (
                <button
                  key={coa.id}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    i === activeIdx
                      ? 'border-brand-primary bg-brand-primary text-white'
                      : 'border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                  )}
                >
                  {tabLabel(coa)}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>

        {/* Only this region scrolls — the certificate stays framed. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#04051f] p-4 md:p-6">
          {coas === null && !error ? (
            <div className="flex items-center justify-center py-20 text-white/60">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading certificate…
            </div>
          ) : error ? (
            <p className="py-16 text-center text-sm text-red-400">
              Couldn&apos;t load the certificate. Please try again.
            </p>
          ) : !activeCoa ? (
            <p className="py-16 text-center text-sm text-white/50">
              No published certificate is available for this product yet.
            </p>
          ) : (
            <CoaCertificate data={activeCoa} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
