'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'

/**
 * Auto-opens the browser print dialog (the standard "Save as PDF" path) when
 * the print view loads, and shows a manual fallback button in case the
 * auto-trigger is blocked. Hidden in the printed output itself.
 */
export function CoaPrintToolbar() {
  useEffect(() => {
    // Small delay so fonts/logo settle before the browser rasterizes the page.
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="coa-print-toolbar fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-white/10 bg-brand-onyx/95 px-4 py-3 backdrop-blur">
      <p className="text-sm text-white/70">
        In the print dialog, choose <span className="font-semibold text-white">Save as PDF</span> as
        the destination.
      </p>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1a30c0]"
      >
        <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
      </button>
    </div>
  )
}
