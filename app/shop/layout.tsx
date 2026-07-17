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
        {/* Main content with bottom padding for mobile nav */}
        <main className="flex-1 container mx-auto px-4 py-6 pb-24 md:pb-8 md:py-8">{children}</main>
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
