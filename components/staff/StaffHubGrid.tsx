import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { StaffPortalLink } from '@/lib/staff/portal'

export function StaffHubGrid({ links }: { links: readonly StaffPortalLink[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/25 hover:bg-white/[0.06]"
        >
          <div>
            <p className="font-semibold text-white">{item.name}</p>
            <p className="mt-1 text-sm text-white/50">{item.description}</p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/25 group-hover:text-white/70" />
        </Link>
      ))}
    </div>
  )
}
