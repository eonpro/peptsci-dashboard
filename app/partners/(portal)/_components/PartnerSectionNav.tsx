'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { glassTrack, liquidActive } from '@/components/ui/glass'
import { sectionLinks, partnerSectionForPath } from '@/lib/partners/portal'
import { usePartnerPortal } from './PartnerPortalProvider'

export function PartnerSectionNav() {
  const pathname = usePathname()
  const section = partnerSectionForPath(pathname)
  const { kind, role, marginModel } = usePartnerPortal()
  if (!section) return null

  const links = sectionLinks(section, { kind, role, marginModel })
  const overviewHref =
    section === 'grow'
      ? '/partners/grow'
      : section === 'earnings'
        ? '/partners/earnings'
        : '/partners/account'
  return (
    <nav
      aria-label={section}
      className={cn(
        'scrollbar-hide mb-6 flex w-fit max-w-full gap-1 overflow-x-auto p-1',
        glassTrack
      )}
    >
      <Link
        href={overviewHref}
        className={cn(
          'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
          pathname === overviewHref
            ? liquidActive
            : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
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
              'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
              active ? liquidActive : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
            )}
          >
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}
