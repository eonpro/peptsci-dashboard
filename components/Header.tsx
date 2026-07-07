'use client'

import { useState, useEffect, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from './Logo'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Package,
  DollarSign,
  TrendingUp,
  Search,
  FileText,
  Receipt,
  Calculator,
  Menu,
  X,
  User,
  ShoppingBag,
  Building2,
} from 'lucide-react'
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import { isClerkConfigured } from '@/lib/clerk-config'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SearchCommand } from './SearchCommand'
import { Badge } from '@/components/ui/badge'

// Conditional Clerk component wrappers
function AuthWrapper({ children, signedIn = true }: { children: ReactNode; signedIn?: boolean }) {
  if (!isClerkConfigured) {
    // When Clerk is not configured, show content based on signedIn prop
    // In dev mode without Clerk, we show signed-in content by default
    return signedIn ? <>{children}</> : null
  }

  const Component = signedIn ? SignedIn : SignedOut
  return <Component>{children}</Component>
}

function AuthUserButton() {
  if (!isClerkConfigured) {
    // Show a placeholder user icon when Clerk is not configured
    return (
      <Button variant="ghost" size="icon" className="rounded-full">
        <User className="h-5 w-5" />
      </Button>
    )
  }

  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: 'h-9 w-9',
        },
      }}
    />
  )
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Clients', href: '/clients', icon: Building2 },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Pricing', href: '/pricing', icon: DollarSign },
  { name: 'Competitors', href: '/competitors', icon: TrendingUp },
  { name: 'Orders/Expenses', href: '/orders-expenses', icon: Receipt },
  { name: 'P&L', href: '/profit-loss', icon: Calculator },
  { name: 'PO Generator', href: '/po-generator', icon: FileText },
]

export function Header() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Keyboard shortcut for search (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm supports-backdrop-filter:bg-white/60">
      <div className="flex h-16 items-center px-4 md:px-6">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="mr-2 lg:hidden"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Logo */}
        <Link href="/dashboard" className="mr-6 flex items-center space-x-2">
          <Logo width={120} height={40} />
          <Badge
            variant="outline"
            className="hidden sm:inline-flex text-xs font-medium border-brand-primary/30 text-brand-primary"
          >
            Admin
          </Badge>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center space-x-1 text-sm font-medium">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center space-x-2 px-3 py-2 rounded-lg transition-all duration-200',
                  isActive
                    ? 'text-brand-primary bg-brand-primary/10 font-semibold'
                    : 'text-muted-foreground hover:text-brand-primary hover:bg-gray-100'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {/* Right side actions */}
        <div className="ml-auto flex items-center space-x-2 md:space-x-4">
          {/* Shop Link */}
          <Link href="/shop" className="hidden md:block">
            <Button variant="outline" size="sm" className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              Shop
            </Button>
          </Link>

          {/* Search button - mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Search button - desktop */}
          <Button
            variant="outline"
            className="hidden lg:flex items-center gap-2 w-64 justify-start text-muted-foreground"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
            <span>Search...</span>
            <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>

          {/* User button */}
          <AuthWrapper signedIn={true}>
            <AuthUserButton />
          </AuthWrapper>
          <AuthWrapper signedIn={false}>
            <Link href="/sign-in">
              <Button
                size="sm"
                className="bg-brand-primary hover:bg-brand-primary/90 text-white font-semibold shadow-xs"
              >
                Sign in
              </Button>
            </Link>
          </AuthWrapper>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent className="fixed inset-y-0 left-0 h-full w-[280px] max-w-[80vw] p-0 border-r rounded-none data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left duration-300">
          <DialogTitle className="sr-only">Navigation Menu</DialogTitle>
          <div className="flex flex-col h-full">
            {/* Mobile menu header */}
            <div className="flex items-center justify-between p-4 border-b">
              <Logo width={100} height={32} />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Mobile search */}
            <div className="p-4 border-b">
              <Button
                variant="outline"
                className="w-full justify-start text-muted-foreground"
                onClick={() => {
                  setMobileMenuOpen(false)
                  setSearchOpen(true)
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
                          'flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200',
                          isActive
                            ? 'text-brand-primary bg-brand-primary/10 font-semibold'
                            : 'text-gray-700 hover:text-brand-primary hover:bg-gray-100'
                        )}
                      >
                        <Icon className={cn('h-5 w-5', isActive && 'text-brand-primary')} />
                        <span className="text-base">{item.name}</span>
                      </Link>
                    </li>
                  )
                })}

                {/* Shop link in mobile menu */}
                <li className="pt-4 border-t mt-4">
                  <Link
                    href="/shop"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-700 hover:text-brand-primary hover:bg-gray-100 transition-all duration-200"
                  >
                    <ShoppingBag className="h-5 w-5" />
                    <span className="text-base">Client Shop</span>
                  </Link>
                </li>
              </ul>
            </nav>

            {/* Mobile menu footer */}
            <div className="p-4 border-t bg-gray-50">
              <AuthWrapper signedIn={true}>
                <div className="flex items-center space-x-3">
                  <AuthUserButton />
                  <div className="text-sm">
                    <p className="font-medium text-gray-900">Admin Account</p>
                    <p className="text-muted-foreground">Manage settings</p>
                  </div>
                </div>
              </AuthWrapper>
              <AuthWrapper signedIn={false}>
                <Link href="/sign-in" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full bg-brand-primary hover:bg-brand-primary/90">
                    Sign in
                  </Button>
                </Link>
              </AuthWrapper>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Global Search Command */}
      <SearchCommand open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  )
}
