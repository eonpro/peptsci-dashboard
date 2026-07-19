import { Metadata } from 'next'
import { ClientHeader } from '@/components/shop/ClientHeader'
import { ClientFooter } from '@/components/shop/ClientFooter'
import { CartProvider } from '@/components/shop/CartContext'
import { CartDrawer } from '@/components/shop/CartDrawer'
import { MobileBottomNav } from '@/components/shop/MobileBottomNav'
import { ThemeScope } from '@/components/ThemeScope'

export const metadata: Metadata = {
  title: 'Client Portal | PeptSci',
  description: 'Order research peptides from PeptSci',
}

// Force dynamic rendering - shop requires auth context
export const dynamic = 'force-dynamic'

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col dark bg-brand-onyx">
        {/* Hoist .dark to <html> so portaled Radix content inherits the theme. */}
        <ThemeScope theme="dark" />
        <ClientHeader />
        {/* Main content: fluid width that tracks the browser window (soft cap
            only on very large monitors), bottom padding clears mobile nav. */}
        <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          {children}
        </main>
        {/* Footer hidden on mobile, shown on desktop */}
        <div className="hidden md:block">
          <ClientFooter />
        </div>
        {/* Mobile bottom navigation */}
        <MobileBottomNav />
        <CartDrawer />
      </div>
    </CartProvider>
  )
}
