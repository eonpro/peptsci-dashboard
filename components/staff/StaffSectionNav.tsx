'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { glassTrack, liquidActive } from '@/components/ui/glass'
import { useRole } from '@/hooks/useRole'
import {
  sectionLinks,
  staffHubOverviewHref,
  staffSectionForPath,
  visibleStaffLinks,
} from '@/lib/staff/portal'

export function StaffSectionNav() {
  const pathname = usePathname()
  const { permissions, isLoading } = useRole()
  const section = staffSectionForPath(pathname)
  if (!section || isLoading) return null

  const links = visibleStaffLinks(sectionLinks(section), permissions)
  const overviewHref = staffHubOverviewHref(section)

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
            : 'text-white/60 hover:bg-white/10 hover:text-white'
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
              active ? liquidActive : 'text-white/60 hover:bg-white/10 hover:text-white'
            )}
          >
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}
