import { Metadata } from 'next'
import { ShopHeader } from '@/components/shop/ShopHeader'
import { CartProvider } from '@/components/shop/CartContext'

export const metadata: Metadata = {
  title: 'Shop | PeptSci',
  description: 'Browse and order pharmaceutical products from PeptSci',
}

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <CartProvider>
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
        <ShopHeader />
        <main className="flex-1 container mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </CartProvider>
  )
}
