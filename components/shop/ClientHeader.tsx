'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ShoppingCart,
  Package,
  ClipboardList,
  User,
  HelpCircle,
  LayoutDashboard,
  Store,
  Receipt,
} from 'lucide-react'
import { useCart } from './CartContext'
import { useRole } from '@/hooks/useRole'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserButton } from '@clerk/nextjs'
import { isClerkConfigured } from '@/lib/clerk-config'

function AuthUserButton() {
  if (!isClerkConfigured) {
    return (
      <div className="h-9 w-9 rounded-full bg-brand-primary/20 flex items-center justify-center">
        <User className="h-5 w-5 text-brand-primary" />
      </div>
    )
  }

  return (
    <UserButton
      appearance={{
        elements: {
          avatarBox: 'h-9 w-9 ring-2 ring-white/30',
        },
      }}
    />
  )
}

const navigation = [
  { name: 'Products', href: '/shop', icon: Package, exact: true },
  { name: 'My Orders', href: '/shop/orders', icon: ClipboardList },
  { name: 'Invoices', href: '/shop/invoices', icon: Receipt },
  { name: 'My Storefront', href: '/shop/storefront-manage', icon: Store },
  { name: 'Account', href: '/shop/account', icon: User },
]

export function ClientHeader() {
  const pathname = usePathname()
  const { totalItems, openCart } = useCart()
  const { isAdmin, isLoading } = useRole()

  return (
    <header className="sticky top-0 z-50 w-full bg-brand-onyx/95 backdrop-blur-xl border-b border-white/10">
      <div className="container mx-auto flex h-14 md:h-16 items-center px-4">
        {/* Logo - centered on mobile, left on desktop */}
        <Link href="/shop" className="flex items-center gap-2 md:gap-3 md:mr-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg"
            alt="PEPTSCI"
            className="h-7 md:h-8 w-auto"
          />
          <Badge
            variant="outline"
            className="hidden md:inline-flex text-[10px] border-brand-primary/50 text-brand-primary bg-brand-primary/10"
          >
            Client Portal
          </Badge>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-brand-primary text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {/* Help - desktop only */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex text-white/50 hover:text-white hover:bg-white/10"
          >
            <HelpCircle className="h-5 w-5" />
          </Button>

          {/* Cart button - visible on both mobile and desktop */}
          <Button
            variant="outline"
            size="default"
            className="relative bg-white/10 border-white/20 text-white hover:bg-brand-primary hover:border-brand-primary h-10 px-3 md:px-4"
            onClick={openCart}
            aria-label={`Shopping cart with ${totalItems} items`}
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="hidden md:inline ml-2">Cart</span>
            {totalItems > 0 && (
              <Badge className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5">
                {totalItems > 99 ? '99+' : totalItems}
              </Badge>
            )}
          </Button>

          {/* User Dropdown - desktop only, mobile uses bottom nav */}
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                  <AuthUserButton />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-brand-onyx border-white/10 text-white"
              >
                <DropdownMenuLabel className="text-white/60">My Account</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  asChild
                  className="hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer"
                >
                  <Link href="/shop/account">
                    <User className="mr-2 h-4 w-4" />
                    Profile & Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild
                  className="hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer"
                >
                  <Link href="/shop/orders">
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Order History
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild
                  className="hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer"
                >
                  <Link href="/shop/invoices">
                    <Receipt className="mr-2 h-4 w-4" />
                    Invoices &amp; Billing
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                {!isLoading && isAdmin && (
                  <>
                    <DropdownMenuItem
                      asChild
                      className="hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer"
                    >
                      <Link href="/dashboard">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        Admin Console
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/10" />
                  </>
                )}
                <DropdownMenuItem className="hover:bg-white/10 focus:bg-white/10 focus:text-white cursor-pointer">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Help & Support
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  )
}
