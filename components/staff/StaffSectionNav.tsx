'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
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
      className="mb-6 flex gap-1 overflow-x-auto border-b border-white/10 pb-px"
    >
      <Link
        href={overviewHref}
        className={cn(
          'shrink-0 border-b-2 px-3 py-2 text-sm font-medium',
          pathname === overviewHref
            ? 'border-white text-white'
            : 'border-transparent text-white/50 hover:text-white'
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
                ? 'border-white text-white'
                : 'border-transparent text-white/50 hover:text-white'
            )}
          >
            {item.name}
          </Link>
        )
      })}
    </nav>
  )
}
