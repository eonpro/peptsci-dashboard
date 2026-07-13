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

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Products', href: '/products', icon: Boxes },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Pricing', href: '/pricing', icon: DollarSign },
  { name: 'Competitors', href: '/competitors', icon: TrendingUp },
  { name: 'Orders/Expenses', href: '/orders-expenses', icon: Receipt },
  { name: 'Fulfillment', href: '/fulfillment', icon: Truck },
  { name: 'Returns', href: '/returns', icon: RotateCcw },
  { name: 'Invoices', href: '/invoices', icon: ReceiptText },
  { name: 'P&L', href: '/profit-loss', icon: Calculator },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'PO Generator', href: '/po-generator', icon: FileText },
  { name: 'Storefronts', href: '/storefronts', icon: Store },
]

// Management surfaces (create/edit records). Grouped in a "Manage" dropdown so
// Clients and Users are reachable without hunting through Settings.
const manageLinks = [
  { name: 'Clients', href: '/clients', icon: Building2 },
  { name: 'Users', href: '/users', icon: UserCog },
  { name: 'Products', href: '/products', icon: Boxes },
  { name: 'Pricing', href: '/pricing', icon: DollarSign },
  { name: 'Client Pricing', href: '/pricing/client-pricing', icon: Tag },
]

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
      <div className="flex h-14 items-center px-4 md:px-6">
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

        {/* Desktop Navigation */}
        <nav className="hidden min-w-0 flex-1 lg:flex items-center gap-1 text-sm overflow-x-auto scrollbar-hide">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 items-center space-x-2 whitespace-nowrap px-3 py-2 rounded-md transition-all duration-200',
                  isActive
                    ? 'text-white bg-brand-primary'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            )
          })}

          {/* Manage dropdown: create/edit surfaces (Clients, Users, catalog, pricing) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-md transition-all duration-200 outline-none',
                  manageLinks.some(
                    (l) => pathname === l.href || pathname.startsWith(`${l.href}/`)
                  )
                    ? 'text-white bg-brand-primary'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}
              >
                <Settings className="h-4 w-4" />
                <span>Manage</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-56 bg-brand-onyx border-[#0a0e3a] text-white"
            >
              <DropdownMenuLabel className="text-white/60">Management</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-white/10" />
              {manageLinks.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem
                    key={item.href}
                    asChild
                    className="hover:bg-white/10 cursor-pointer focus:bg-white/10 focus:text-white"
                  >
                    <Link href={item.href}>
                      <Icon className="mr-2 h-4 w-4" />
                      {item.name}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Right side actions */}
        <div className="ml-auto flex shrink-0 items-center space-x-2 lg:ml-4">
          {/* Search button */}
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:flex items-center gap-2 text-white/70 hover:text-white hover:bg-white/10 border border-white/20 px-3"
            onClick={openSearch}
          >
            <Search className="h-4 w-4" />
            <span className="text-sm">Search...</span>
            <kbd className="hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 font-mono text-[10px] text-white/60">
              ⌘K
            </kbd>
          </Button>

          {/* Mobile search */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-white/70 hover:text-white hover:bg-white/10"
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
              <DropdownMenuItem className="hover:bg-white/10 cursor-pointer focus:bg-white/10 focus:text-white">
                <Settings className="mr-2 h-4 w-4" />
                System Settings
              </DropdownMenuItem>
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

          {/* Mobile navigation links */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

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

            {/* Management links (create/edit surfaces) */}
            <div className="mt-6">
              <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                Manage
              </p>
              <ul className="space-y-1">
                {manageLinks.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

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
            </div>
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
