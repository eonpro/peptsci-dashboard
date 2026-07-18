'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  name: string
  href: string
  orgOnly?: boolean
  marginOnly?: boolean
}

const NAV: NavItem[] = [
  { name: 'Dashboard', href: '/partners' },
  { name: 'Clinics', href: '/partners/clinics' },
  { name: 'Transactions', href: '/partners/transactions' },
  { name: 'Payouts', href: '/partners/payouts' },
  { name: 'Links', href: '/partners/links' },
  { name: 'Quotes', href: '/partners/quotes' },
  { name: 'Goals', href: '/partners/goals' },
  { name: 'Pricing', href: '/partners/pricing', orgOnly: true, marginOnly: true },
  { name: 'Reps', href: '/partners/reps', orgOnly: true },
  { name: 'Team', href: '/partners/team', orgOnly: true },
  { name: 'API', href: '/partners/api', orgOnly: true },
  { name: 'Agreement', href: '/partners/agreement' },
]

export function PortalNav({
  kind,
  role,
  marginModel,
}: {
  kind: 'ORG' | 'REP'
  role: 'OWNER' | 'ADMIN' | 'VIEWER' | null
  marginModel: boolean
}) {
  const pathname = usePathname()
  const items = NAV.filter((item) => {
    if (item.orgOnly && kind !== 'ORG') return false
    if (item.marginOnly && !marginModel) return false
    // API keys/team management need at least ADMIN.
    if ((item.href === '/partners/api' || item.href === '/partners/team') && role === 'VIEWER') {
      return false
    }
    return true
  })

  return (
    <nav className="overflow-x-auto border-t border-white/10">
      <div className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6">
        {items.map((item) => {
          const active =
            item.href === '/partners' ? pathname === '/partners' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition',
                active
                  ? 'border-primary font-semibold text-white'
                  : 'border-transparent text-white/60 hover:text-white'
              )}
            >
              {item.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
