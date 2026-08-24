import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { PartnerPortalLink } from '@/lib/partners/portal'

export function PartnerHubGrid({ links }: { links: readonly PartnerPortalLink[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-primary/40 hover:bg-slate-50"
        >
          <div>
            <p className="font-semibold text-slate-900">{item.name}</p>
            <p className="mt-1 text-sm text-slate-500">{item.description}</p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-primary" />
        </Link>
      ))}
    </div>
  )
}
