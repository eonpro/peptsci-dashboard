'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CoaCertificate } from '@/components/coa/CoaCertificate'
import type { CoaData } from '@/lib/coa'
import { Loader2, FileText, Download } from 'lucide-react'

interface CoaDialogProps {
  sku: string
  productName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Lazy COA viewer: fetches published certificates for a SKU on open and
 * renders the styled certificate in a scrollable modal, with a link to the
 * original source document when one exists.
 */
export function CoaDialog({ sku, productName, open, onOpenChange }: CoaDialogProps) {
  const [coas, setCoas] = useState<CoaData[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open) return
    setCoas(null)
    setError(false)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto bg-brand-onyx border-white/10 p-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-white/10 bg-brand-onyx/95 px-5 py-4 backdrop-blur">
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="h-5 w-5 text-brand-primary" />
            Certificate of Analysis — {productName}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 md:p-6">
          {coas === null && !error ? (
            <div className="flex items-center justify-center py-20 text-white/60">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading certificate…
            </div>
          ) : error ? (
            <p className="py-16 text-center text-sm text-red-400">
              Couldn&apos;t load the certificate. Please try again.
            </p>
          ) : coas && coas.length === 0 ? (
            <p className="py-16 text-center text-sm text-white/50">
              No published certificate is available for this product yet.
            </p>
          ) : (
            <div className="space-y-6">
              {coas!.map((coa) => (
                <div key={coa.id} className="space-y-3">
                  <CoaCertificate data={coa} />
                  {coa.hasFile && coa.fileUrl && (
                    <a
                      href={coa.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
                    >
                      <Download className="h-4 w-4" /> View original document
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
