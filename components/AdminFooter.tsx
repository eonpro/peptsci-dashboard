'use client'

import Link from 'next/link'
import { SUPPORT_EMAIL } from '@/lib/shop/portal'

export function AdminFooter() {
  return (
    <footer className="border-t border-white/10 bg-brand-onyx px-6 py-4">
      <div className="flex flex-col items-center justify-between gap-4 text-sm sm:flex-row">
        <div className="flex items-center gap-4 text-white/50">
          <span>© {new Date().getFullYear()} PEPTSCI</span>
          <span className="hidden text-white/20 sm:inline">•</span>
          <span className="hidden sm:inline">Staff console</span>
        </div>
        <div className="flex items-center gap-6 text-white/50">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="transition-colors hover:text-white">
            Support
          </a>
          <Link href="/support" className="transition-colors hover:text-white">
            Tickets
          </Link>
        </div>
      </div>
    </footer>
  )
}
