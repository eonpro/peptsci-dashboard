'use client'

import Link from 'next/link'

export function AdminFooter() {
  return (
    <footer className="bg-[#050722] border-t border-white/10 py-4 px-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-4 text-white/50">
          <span>© {new Date().getFullYear()} PEPTSCI</span>
          <span className="hidden sm:inline text-white/20">•</span>
          <span className="hidden sm:inline">Admin Console v1.0</span>
        </div>
        <div className="flex items-center gap-6 text-white/50">
          <Link href="#" className="hover:text-white transition-colors">
            Documentation
          </Link>
          <Link href="#" className="hover:text-white transition-colors">
            System Status
          </Link>
          <Link href="#" className="hover:text-white transition-colors">
            Support
          </Link>
        </div>
      </div>
    </footer>
  )
}
