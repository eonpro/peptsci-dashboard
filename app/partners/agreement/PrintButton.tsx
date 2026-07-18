'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton() {
  return (
    <Button
      variant="outline"
      className="gap-1.5 bg-white text-slate-600"
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4" /> Print / PDF
    </Button>
  )
}
