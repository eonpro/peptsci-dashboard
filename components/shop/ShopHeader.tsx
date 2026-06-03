'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ShoppingCart, Package, ClipboardList, User, Menu, LayoutDashboard } from 'lucide-react'
import { useCart } from './CartContext'
import { CartDrawer } from './CartDrawer'
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useRole } from '@/hooks/useRole'
import { UserButton } from '@clerk/nextjs'
import { isClerkConfigured } from '@/lib/clerk-config'

// Conditional auth wrapper
function AuthUserButton() {
  if (!isClerkConfigured) {
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
  { name: 'Catalog', href: '/shop', icon: Package },
  { name: 'My Orders', href: '/shop/orders', icon: ClipboardList },
  { name: 'Account', href: '/shop/account', icon: User },
]

export function ShopHeader() {
  const pathname = usePathname()
  const { totalItems, openCart } = useCart()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isAdmin, isLoading } = useRole()

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="container mx-auto flex h-16 items-center px-4">
          {/* Mobile menu button */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-2 md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle>
                  <Logo width={100} height={32} />
                </SheetTitle>
              </SheetHeader>
              <nav className="p-4">
                <ul className="space-y-1">
                  {navigation.map((item) => {
                    const Icon = item.icon
                    const isActive =
                      pathname === item.href ||
                      (item.href === '/shop' && pathname === '/shop') ||
                      (item.href !== '/shop' && pathname.startsWith(item.href))

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                            isActive
                              ? 'bg-indigo-50 text-indigo-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-100'
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
              {/* Admin link - only for admins */}
              {!isLoading && isAdmin && (
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-gray-50">
                  <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      Admin Dashboard
                    </Button>
                  </Link>
                </div>
              )}
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link href="/shop" className="mr-8 flex items-center">
            <Logo width={120} height={40} />
            <Badge variant="secondary" className="ml-3 hidden sm:inline-flex">
              Shop
            </Badge>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive =
                pathname === item.href ||
                (item.href === '/shop' && pathname === '/shop') ||
                (item.href !== '/shop' && pathname.startsWith(item.href))

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            {/* Admin link - desktop only, for admins only */}
            {!isLoading && isAdmin && (
              <Link href="/dashboard" className="hidden lg:block">
                <Button variant="ghost" size="sm" className="text-gray-500 gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Admin
                </Button>
              </Link>
            )}

            {/* Cart button */}
            <Button
              variant="outline"
              size="icon"
              className="relative"
              onClick={openCart}
              aria-label={`Shopping cart with ${totalItems} items`}
            >
              <ShoppingCart className="h-5 w-5" />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                  {totalItems > 99 ? '99+' : totalItems}
                </span>
              )}
            </Button>

            {/* User button */}
            <AuthUserButton />
          </div>
        </div>
      </header>

      {/* Cart Drawer */}
      <CartDrawer />
    </>
  )
}
