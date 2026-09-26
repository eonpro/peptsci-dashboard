'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useClerk } from '@clerk/nextjs'
import { cn } from '@/lib/utils'
import { liquidActive } from '@/components/ui/glass'
import { isClerkConfigured } from '@/lib/clerk-config'
import { visiblePrimaryNav, isNavItemActive, type PortalNavContext } from './nav'

export interface PortalIdentity {
  orgName: string
  /** e.g. "Org owner", "Rep — Jane Doe" */
  roleLabel: string
}

/** Isolated so useClerk only runs when ClerkProvider is present. */
function SignOutButton() {
  const { signOut } = useClerk()
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectUrl: '/partners/sign-in' })}
      className="mt-3 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-white/50 transition hover:bg-white/5 hover:text-white"
    >
      <LogOut className="h-4 w-4 shrink-0" />
      Log out
    </button>
  )
}

/**
 * Shared sidebar body: brand, grouped nav, identity footer. Rendered inside the
 * fixed desktop sidebar and the mobile Sheet drawer.
 */
export function SidebarNav({
  ctx: _ctx,
  identity,
  onNavigate,
}: {
  ctx: PortalNavContext
  identity: PortalIdentity
  onNavigate?: () => void
}) {
  void _ctx
  const pathname = usePathname()
  const items = visiblePrimaryNav()
  const initials = identity.orgName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="relative isolate flex h-full flex-col overflow-hidden bg-brand-onyx/90 text-white shadow-[inset_-1px_0_0_0_rgb(255_255_255/0.08)] backdrop-blur-2xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_45%_at_0%_0%,rgb(33_60_239/0.45),transparent),radial-gradient(80%_40%_at_100%_100%,rgb(46_230_208/0.18),transparent)]"
      />
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/partners" onClick={onNavigate} className="text-base font-bold tracking-wide">
          PEPTSCI <span className="font-normal text-white/50">Partners</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isNavItemActive(item.href, pathname, item.exact)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition',
                    active
                      ? cn(liquidActive, 'font-semibold')
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0 transition',
                      active ? 'text-white' : 'text-white/40 group-hover:text-white/70'
                    )}
                  />
                  {item.name}
                </Link>
              </li>
            )
          })}
        </ul>
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
        {isClerkConfigured ? <SignOutButton /> : null}
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
