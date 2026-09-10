'use client'

import { useEffect, useState } from 'react'
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

const UNREAD_POLL_MS = 60_000

/** Unread SMS threads for the Messages tab badge; polls only while relevant. */
function useSmsUnreadCount(enabled: boolean): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () =>
      fetch('/api/admin/messages/unread-count')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setCount(Number(d.unread) || 0)
        })
        .catch(() => {})
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, UNREAD_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled])
  return count
}

export function StaffSectionNav() {
  const pathname = usePathname()
  const { permissions, isLoading } = useRole()
  const section = staffSectionForPath(pathname)
  const links = section ? visibleStaffLinks(sectionLinks(section), permissions) : []
  const showsMessages = links.some((l) => l.href === '/messages')
  const smsUnread = useSmsUnreadCount(!isLoading && showsMessages)
  if (!section || isLoading) return null

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
            {item.href === '/messages' && smsUnread > 0 && (
              <span
                className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-brand-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                aria-label={`${smsUnread} unread text conversations`}
              >
                {smsUnread > 99 ? '99+' : smsUnread}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
