'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { pageTitleForPath, type PortalNavContext } from './nav'
import { SidebarNav, type PortalIdentity } from './PortalSidebar'

/**
 * Sticky top bar: mobile hamburger (Sheet drawer with the full nav), current
 * page title, and the org / role chip on desktop.
 */
export function PortalTopbar({
  ctx,
  identity,
}: {
  ctx: PortalNavContext
  identity: PortalIdentity
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 text-slate-600 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 border-r-0 bg-brand-onyx p-0 text-white [&>button]:text-white"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarNav ctx={ctx} identity={identity} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <h1 className="truncate text-sm font-semibold text-slate-900">
          {pageTitleForPath(pathname)}
        </h1>

        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {identity.orgName}
          </span>
          <span className="rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-medium text-brand-primary">
            {identity.roleLabel}
          </span>
        </div>
      </div>
    </header>
  )
}
