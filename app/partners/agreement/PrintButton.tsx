'use client'

import { Printer } from 'lucide-react'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-white"
    >
      <Printer className="h-4 w-4" /> Print / PDF
    </button>
  )
}
