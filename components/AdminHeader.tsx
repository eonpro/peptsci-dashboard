'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Package,
  Search,
  Settings,
  Truck,
  User,
  Wallet,
} from 'lucide-react'
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import { isClerkConfigured } from '@/lib/clerk-config'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NotificationBell } from '@/components/NotificationBell'
import { useRole } from '@/hooks/useRole'
import { formatUnreadBadge, useSmsUnreadCount } from '@/hooks/useSmsUnreadCount'
import { cn } from '@/lib/utils'
import {
  isStaffPrimaryActive,
  visiblePrimaryNav,
  type StaffPrimaryNavItem,
} from '@/lib/staff/portal'

const SearchCommand = dynamic(() => import('./SearchCommand').then((m) => m.SearchCommand), {
  ssr: false,
})

function AuthWrapper({ children, signedIn = true }: { children: ReactNode; signedIn?: boolean }) {
  if (!isClerkConfigured) {
    return signedIn ? <>{children}</> : null
  }
  const Component = signedIn ? SignedIn : SignedOut
  return <Component>{children}</Component>
}

function AuthUserButton() {
  if (!isClerkConfigured) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full text-slate-300 hover:bg-slate-700 hover:text-white"
      >
        <User className="h-5 w-5" />
      </Button>
    )
  }
  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: 'h-8 w-8 ring-2 ring-slate-600',
          userButtonPopoverCard: 'bg-slate-800 border-slate-700',
        },
      }}
    />
  )
}

const NAV_ICONS: Record<StaffPrimaryNavItem['name'], typeof Home> = {
  Home: LayoutDashboard,
  Fulfill: Truck,
  Messages: MessageSquareText,
  Catalog: Package,
  Money: Wallet,
  Admin: Settings,
}

/** Unread-thread count pill for the Messages tab. */
function UnreadPill({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex min-w-[18px] items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold leading-none text-brand-primary',
        className
      )}
      aria-label={`${count} unread text conversations`}
    >
      {formatUnreadBadge(count)}
    </span>
  )
}

export function AdminHeader() {
  const pathname = usePathname()
  const { permissions, isLoading: roleLoading } = useRole()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchMounted, setSearchMounted] = useState(false)

  const items = useMemo(
    () => (roleLoading ? [] : visiblePrimaryNav(permissions)),
    [permissions, roleLoading]
  )
  const showsMessages = items.some((i) => i.href === '/messages')
  const smsUnread = useSmsUnreadCount(showsMessages)

  const openSearch = () => {
    setSearchMounted(true)
    setSearchOpen(true)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchMounted(true)
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#0a0e3a] bg-brand-onyx">
      <div className="px-4 md:px-6">
        <div className="container mx-auto flex h-14 items-center px-6">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Link href="/dashboard" className="mr-8 flex shrink-0 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg"
              alt="PEPTSCI"
              className="h-8 w-auto"
            />
          </Link>

          <nav className="hidden shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm lg:flex">
            {items.map((item) => {
              const Icon = NAV_ICONS[item.name]
              const isActive = isStaffPrimaryActive(item.href, pathname, item.exact)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 transition-all duration-200',
                    isActive
                      ? 'bg-brand-primary text-white shadow-[0_4px_16px_-4px_rgba(33,60,239,0.7)]'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                  {item.href === '/messages' && (
                    <UnreadPill
                      count={smsUnread}
                      className={isActive ? undefined : 'bg-brand-primary text-white'}
                    />
                  )}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 lg:ml-6">
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-4 text-white/50 hover:bg-white/10 hover:text-white xl:flex xl:max-w-xl"
              onClick={openSearch}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate text-sm">Search orders, clinics, invoices…</span>
              <kbd className="ml-auto hidden h-5 shrink-0 select-none items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] text-white/60 xl:inline-flex">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search"
              className="text-white/70 hover:bg-white/10 hover:text-white xl:hidden"
              onClick={openSearch}
            >
              <Search className="h-5 w-5" />
            </Button>
            <NotificationBell />
            <AuthWrapper signedIn={true}>
              <AuthUserButton />
            </AuthWrapper>
            <AuthWrapper signedIn={false}>
              <Link href="/staff/sign-in">
                <Button size="sm" className="bg-brand-primary text-white hover:bg-[#1a30c0]">
                  Sign in
                </Button>
              </Link>
            </AuthWrapper>
          </div>
        </div>
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] border-r border-[#0a0e3a] bg-brand-onyx p-0">
          <SheetHeader className="border-b border-white/10 p-4">
            <SheetTitle>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg"
                alt="PEPTSCI"
                className="h-6 w-auto"
              />
            </SheetTitle>
          </SheetHeader>
          <nav className="p-4">
            <ul className="space-y-1">
              {items.map((item) => {
                const Icon = NAV_ICONS[item.name]
                const isActive = isStaffPrimaryActive(item.href, pathname, item.exact)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200',
                        isActive
                          ? 'bg-brand-primary text-white'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.name}</span>
                      {item.href === '/messages' && (
                        <UnreadPill
                          count={smsUnread}
                          className={cn('ml-auto', isActive ? undefined : 'bg-brand-primary text-white')}
                        />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>

      {searchMounted && <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />}
    </header>
  )
}
