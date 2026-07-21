'use client'

import { useState, useEffect, ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Boxes,
  Package,
  DollarSign,
  TrendingUp,
  Search,
  FileText,
  Camera,
  Receipt,
  Calculator,
  Menu,
  User,
  Settings,
  Store,
  Truck,
  RotateCcw,
  Webhook,
  ReceiptText,
  BarChart3,
  Building2,
  UserCog,
  Tag,
  ChevronDown,
  Handshake,
  BookOpen,
  LifeBuoy,
} from 'lucide-react'
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import { isClerkConfigured } from '@/lib/clerk-config'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NotificationBell } from '@/components/NotificationBell'

// The command palette pulls in `cmdk` and renders on every admin page. Load it
// lazily and only mount it once the user first opens search, so it stays out of
// the shared admin chunk.
const SearchCommand = dynamic(() => import('./SearchCommand').then((m) => m.SearchCommand), {
  ssr: false,
})
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Conditional Clerk component wrappers
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
        className="rounded-full text-slate-300 hover:text-white hover:bg-slate-700"
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

interface NavLink {
  name: string
  href: string
  icon: typeof LayoutDashboard
  /** One-line hint shown in the dropdown panel. */
  desc?: string
}

interface NavGroupDef {
  name: string
  icon: typeof LayoutDashboard
  links: NavLink[]
}

/**
 * Navigation IA: two direct destinations (the daily surfaces) + four intent
 * groups. Replaces the old 15-tab overflow-scroll row — every surface is at
 * most two clicks away and the bar never scrolls horizontally.
 */
const directLinks: NavLink[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Fulfillment', href: '/fulfillment', icon: Truck },
]

const navGroups: NavGroupDef[] = [
  {
    name: 'Sales',
    icon: TrendingUp,
    links: [
      { name: 'Customers', href: '/customers', icon: Users, desc: 'Revenue rollup by customer' },
      { name: 'Orders & Expenses', href: '/orders-expenses', icon: Receipt, desc: 'Distributor orders and spend' },
      { name: 'P&L', href: '/profit-loss', icon: Calculator, desc: 'Profit and loss statement' },
      { name: 'Reports', href: '/reports', icon: BarChart3, desc: 'Analytics and CSV exports' },
      { name: 'Competitors', href: '/competitors', icon: TrendingUp, desc: 'Market price tracking' },
    ],
  },
  {
    name: 'Catalog',
    icon: Boxes,
    links: [
      { name: 'Products', href: '/products', icon: Boxes, desc: 'Catalog, SKUs, and COAs' },
      { name: 'Inventory', href: '/inventory', icon: Package, desc: 'Stock, batches, activity log' },
      { name: 'Pricing', href: '/pricing', icon: DollarSign, desc: 'Cost and SRP price sheet' },
      { name: 'Client Pricing', href: '/pricing/client-pricing', icon: Tag, desc: 'Per-clinic custom prices' },
      { name: 'PO Generator', href: '/po-generator', icon: FileText, desc: 'Purchase order PDFs' },
    ],
  },
  {
    name: 'Billing',
    icon: ReceiptText,
    links: [
      { name: 'Invoices', href: '/invoices', icon: ReceiptText, desc: 'Billing, payments, aging' },
      { name: 'Returns', href: '/returns', icon: RotateCcw, desc: 'RMAs, inspection, restock' },
    ],
  },
  {
    name: 'Manage',
    icon: Settings,
    links: [
      { name: 'Clients', href: '/clients', icon: Building2, desc: 'Practice accounts and approvals' },
      { name: 'Users', href: '/users', icon: UserCog, desc: 'Logins, roles, invitations' },
      { name: 'Partners', href: '/partners-admin', icon: Handshake, desc: 'Sales orgs and commissions' },
      { name: 'Storefronts', href: '/storefronts', icon: Store, desc: 'White-label clinic stores' },
      { name: 'Resources', href: '/resources', icon: BookOpen, desc: 'Client education articles' },
      { name: 'Package Photos', href: '/package-photos', icon: Camera, desc: 'Contents photos by order' },
      { name: 'Support', href: '/support', icon: LifeBuoy, desc: 'Clinic support tickets' },
    ],
  },
]

const isPathActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`)

/**
 * Pricing is a prefix of Client Pricing — resolve the MOST specific match so
 * only one item ever highlights.
 */
const isLinkActive = (pathname: string, link: NavLink, siblings: NavLink[]) => {
  if (!isPathActive(pathname, link.href)) return false
  return !siblings.some(
    (s) => s.href !== link.href && s.href.startsWith(link.href) && isPathActive(pathname, s.href)
  )
}

export function AdminHeader() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // Stays true after the first open so the lazy palette keeps its mounted state.
  const [searchMounted, setSearchMounted] = useState(false)

  const openSearch = () => {
    setSearchMounted(true)
    setSearchOpen(true)
  }

  // Keyboard shortcut for search (Cmd/Ctrl + K)
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
    <header className="sticky top-0 z-50 w-full bg-brand-onyx border-b border-[#0a0e3a]">
      {/* Same wrapper chain as the page body (layout p-4/md:p-6 → container
          p-6), so the logo and avatar align with the card edges below. */}
      <div className="px-4 md:px-6">
        <div className="container mx-auto flex h-14 items-center px-6">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 lg:hidden text-white/70 hover:text-white hover:bg-white/10"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo */}
        <Link href="/dashboard" className="mr-8 flex shrink-0 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg"
            alt="PEPTSCI"
            className="h-8 w-auto"
          />
        </Link>

        {/* Desktop Navigation: 2 direct links + 4 intent groups. shrink-0 —
            the pills must never compress and spill under the search bar. */}
        <nav className="hidden shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm lg:flex">
          {directLinks.map((item) => {
            const Icon = item.icon
            const isActive = isPathActive(pathname, item.href)
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
              </Link>
            )
          })}

          {navGroups.map((group) => {
            const GroupIcon = group.icon
            const groupActive = group.links.some((l) => isPathActive(pathname, l.href))
            return (
              <DropdownMenu key={group.name}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'group flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 outline-none transition-all duration-200 data-[state=open]:bg-white/10 data-[state=open]:text-white',
                      groupActive
                        ? 'bg-brand-primary text-white shadow-[0_4px_16px_-4px_rgba(33,60,239,0.7)]'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <GroupIcon className="h-4 w-4" />
                    <span>{group.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={10}
                  className="w-72 rounded-2xl border-white/10 bg-brand-onyx/95 p-2 text-white shadow-2xl shadow-black/50 backdrop-blur-xl"
                >
                  {group.links.map((item) => {
                    const Icon = item.icon
                    const active = isLinkActive(pathname, item, group.links)
                    return (
                      <DropdownMenuItem
                        key={item.href}
                        asChild
                        className="cursor-pointer rounded-xl px-2 py-2 hover:bg-white/10 focus:bg-white/10 focus:text-white"
                      >
                        <Link href={item.href} className="flex items-start gap-3">
                          <span
                            className={cn(
                              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                              active
                                ? 'bg-brand-primary text-white'
                                : 'bg-white/5 text-white/60'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span
                              className={cn(
                                'block text-sm font-medium',
                                active ? 'text-white' : 'text-white/90'
                              )}
                            >
                              {item.name}
                            </span>
                            {item.desc && (
                              <span className="block text-xs text-white/45">{item.desc}</span>
                            )}
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          })}
        </nav>

        {/* Right side: search stretches to fill the gap so the icon cluster
            lands flush with the page's right edge. */}
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 lg:ml-6">
          {/* Wide search bar — only when there's real room for it (xl+);
              narrower widths get the icon button instead of overlapping. */}
          <Button
            variant="ghost"
            size="sm"
            className="hidden h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-4 text-white/50 hover:bg-white/10 hover:text-white xl:flex xl:max-w-xl"
            onClick={openSearch}
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm">Search orders, clients, invoices…</span>
            <kbd className="ml-auto hidden h-5 shrink-0 select-none items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] text-white/60 xl:inline-flex">
              ⌘K
            </kbd>
          </Button>

          {/* Compact search (mobile through lg) */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Search"
            className="xl:hidden text-white/70 hover:text-white hover:bg-white/10"
            onClick={openSearch}
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Notifications */}
          <NotificationBell />

          {/* Settings Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:text-white hover:bg-white/10"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 bg-brand-onyx border-[#0a0e3a] text-white"
            >
              <DropdownMenuLabel className="text-white/60">Admin Settings</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                className="hover:bg-white/10 cursor-pointer focus:bg-white/10 focus:text-white"
                asChild
              >
                <Link href="/settings/stripe">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Payments (Stripe)
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="hover:bg-white/10 cursor-pointer focus:bg-white/10 focus:text-white"
                asChild
              >
                <Link href="/settings/webhooks">
                  <Webhook className="mr-2 h-4 w-4" />
                  Webhook Events
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="hover:bg-white/10 cursor-pointer focus:bg-white/10 focus:text-white"
                asChild
              >
                <Link href="/users">
                  <Users className="mr-2 h-4 w-4" />
                  User Management
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                className="hover:bg-white/10 cursor-pointer focus:bg-white/10 focus:text-white"
                asChild
              >
                <Link href="/shop">
                  <Package className="mr-2 h-4 w-4" />
                  Switch to Client Portal
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User button */}
          <AuthWrapper signedIn={true}>
            <AuthUserButton />
          </AuthWrapper>
          <AuthWrapper signedIn={false}>
            <Link href="/sign-in">
              <Button size="sm" className="bg-brand-primary hover:bg-[#1a30c0] text-white">
                Sign in
              </Button>
            </Link>
          </AuthWrapper>
        </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[280px] p-0 border-r border-[#0a0e3a] bg-brand-onyx">
          <SheetHeader className="p-4 border-b border-white/10">
            <SheetTitle className="flex items-center justify-between">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg"
                alt="PEPTSCI"
                className="h-6 w-auto"
              />
            </SheetTitle>
          </SheetHeader>

          {/* Mobile search */}
          <div className="p-4 border-b border-white/10">
            <Button
              variant="outline"
              className="w-full justify-start bg-white/10 text-white border-white/30 hover:bg-white/20 hover:text-white"
              onClick={() => {
                setMobileMenuOpen(false)
                openSearch()
              }}
            >
              <Search className="mr-2 h-4 w-4" />
              Search...
            </Button>
          </div>

          {/* Mobile navigation: same grouped IA as desktop */}
          <nav className="flex-1 overflow-y-auto p-4 pb-24">
            <ul className="space-y-1">
              {directLinks.map((item) => {
                const Icon = item.icon
                const isActive = isPathActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200',
                        isActive
                          ? 'text-white bg-brand-primary'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>

            {navGroups.map((group) => (
              <div key={group.name} className="mt-6">
                <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                  {group.name}
                </p>
                <ul className="space-y-1">
                  {group.links.map((item) => {
                    const Icon = item.icon
                    const active = isLinkActive(pathname, item, group.links)
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            'flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200',
                            active
                              ? 'text-white bg-brand-primary'
                              : 'text-white/70 hover:text-white hover:bg-white/10'
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span>{item.name}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* Mobile menu footer */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/20 bg-[#0a0e3a]">
            <Link href="/shop" onClick={() => setMobileMenuOpen(false)}>
              <Button
                variant="outline"
                className="w-full bg-white/10 border-white/30 text-white hover:bg-brand-primary hover:border-brand-primary hover:text-white"
              >
                <Package className="mr-2 h-4 w-4" />
                Switch to Client Portal
              </Button>
            </Link>
          </div>
        </SheetContent>
      </Sheet>

      {/* Global Search Command (lazy: only mounted after first open) */}
      {searchMounted && <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />}
    </header>
  )
}
