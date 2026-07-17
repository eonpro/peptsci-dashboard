'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useCart } from './CartContext'
import { Home, Search, ShoppingCart, ClipboardList, User } from 'lucide-react'

const navItems = [
  { href: '/shop', icon: Home, label: 'Shop', exact: true },
  { href: '/shop#search', icon: Search, label: 'Search', action: 'search' },
  { href: '#cart', icon: ShoppingCart, label: 'Cart', action: 'cart' },
  { href: '/shop/orders', icon: ClipboardList, label: 'Orders' },
  { href: '/shop/account', icon: User, label: 'Account' },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const { totalItems, openCart } = useCart()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-brand-onyx/95 backdrop-blur-xl border-t border-white/10 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href) && item.href !== '#cart'

          const isCart = item.action === 'cart'

          const handleClick = (e: React.MouseEvent) => {
            if (isCart) {
              e.preventDefault()
              openCart()
            }
          }

          const content = (
            <div className="flex flex-col items-center justify-center gap-1 relative">
              <div
                className={cn(
                  'relative flex items-center justify-center w-10 h-10 rounded-xl transition-all',
                  isActive
                    ? 'bg-brand-primary text-white scale-110'
                    : 'text-white/50 hover:text-white active:scale-95'
                )}
              >
                <item.icon className="h-5 w-5" />
                {/* Cart badge */}
                {isCart && totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                    {totalItems > 99 ? '99+' : totalItems}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium transition-colors',
                  isActive ? 'text-white' : 'text-white/50'
                )}
              >
                {item.label}
              </span>
            </div>
          )

          if (isCart) {
            return (
              <button
                key={item.href}
                onClick={handleClick}
                className="flex-1 flex items-center justify-center py-2 active:opacity-70 transition-opacity"
              >
                {content}
              </button>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex items-center justify-center py-2 active:opacity-70 transition-opacity"
            >
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
