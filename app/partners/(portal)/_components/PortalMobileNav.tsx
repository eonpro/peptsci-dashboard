'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { isPartnerMobileActive } from '@/lib/partners/portal'
import { visibleMobileNav } from './nav'

export function PortalMobileNav() {
  const pathname = usePathname()
  const items = visibleMobileNav()

  return (
    <nav
      aria-label="Partner"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex h-14 items-stretch">
        {items.map((item) => {
          const active = isPartnerMobileActive(item.href, pathname, item.exact)
          const Icon = item.icon
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  active ? 'text-brand-primary' : 'text-slate-500'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.name}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
