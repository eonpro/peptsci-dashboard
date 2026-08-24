'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { sectionLinks, partnerSectionForPath } from '@/lib/partners/portal'
import { usePartnerPortal } from './PartnerPortalProvider'

export function PartnerSectionNav() {
  const pathname = usePathname()
  const section = partnerSectionForPath(pathname)
  const { kind, role, marginModel } = usePartnerPortal()
  if (!section) return null

  const links = sectionLinks(section, { kind, role, marginModel })
  const overviewHref =
    section === 'grow' ? '/partners/grow' : section === 'earnings' ? '/partners/earnings' : '/partners/account'
  return (
    <nav
      aria-label={section}
      className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 pb-px"
    >
      <Link
        href={overviewHref}
        className={cn(
          'shrink-0 border-b-2 px-3 py-2 text-sm font-medium',
          pathname === overviewHref
            ? 'border-brand-primary text-slate-900'
            : 'border-transparent text-slate-500 hover:text-slate-800'
        )}
      >
        Overview
      </Link>
      {links.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-sm font-medium',
              active
                ? 'border-brand-primary text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}
