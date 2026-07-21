'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { visibleSections, isNavItemActive, type PortalNavContext } from './nav'

export interface PortalIdentity {
  orgName: string
  /** e.g. "Org owner", "Rep — Jane Doe" */
  roleLabel: string
}

/**
 * Shared sidebar body: brand, grouped nav, identity footer. Rendered inside the
 * fixed desktop sidebar and the mobile Sheet drawer.
 */
export function SidebarNav({
  ctx,
  identity,
  onNavigate,
}: {
  ctx: PortalNavContext
  identity: PortalIdentity
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const sections = visibleSections(ctx)
  const initials = identity.orgName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="flex h-full flex-col bg-brand-onyx text-white">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link
          href="/partners"
          onClick={onNavigate}
          className="text-base font-bold tracking-wide"
        >
          PEPTSCI <span className="font-normal text-white/50">Partners</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {sections.map((section) => (
          <div key={section.label ?? 'main'}>
            {section.label && (
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/35">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavItemActive(item.href, pathname)
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition',
                        active
                          ? 'bg-white/10 font-semibold text-white'
                          : 'text-white/60 hover:bg-white/5 hover:text-white'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition',
                          active
                            ? 'text-brand-primary brightness-150'
                            : 'text-white/40 group-hover:text-white/70'
                        )}
                      />
                      {item.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
            {initials || 'P'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{identity.orgName}</p>
            <p className="truncate text-xs text-white/50">{identity.roleLabel}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Fixed desktop sidebar (hidden below lg; mobile uses the Sheet drawer in the topbar). */
export function PortalSidebar({
  ctx,
  identity,
}: {
  ctx: PortalNavContext
  identity: PortalIdentity
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
      <SidebarNav ctx={ctx} identity={identity} />
    </aside>
  )
}
