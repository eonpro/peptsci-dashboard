'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Package, Settings, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRole } from '@/hooks/useRole'
import { isStaffMobileActive, visibleMobileNav } from '@/lib/staff/portal'

const ICONS = {
  Home,
  Fulfillment: Truck,
  Catalog: Package,
  Admin: Settings,
} as const

export function StaffMobileNav() {
  const pathname = usePathname()
  const { permissions, isLoading } = useRole()
  if (isLoading) return null
  const items = visibleMobileNav(permissions)

  return (
    <nav
      aria-label="Staff"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-brand-onyx/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex h-14 items-stretch">
        {items.map((item) => {
          const active = isStaffMobileActive(item.href, pathname, item.exact)
          const Icon = ICONS[item.name]
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  active ? 'text-white' : 'text-white/50'
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
