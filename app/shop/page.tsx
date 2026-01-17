import { Suspense } from 'react'
import { getInventory } from '@/lib/sheets'
import { ProductGrid } from '@/components/shop/ProductGrid'
import { CatalogFilters } from '@/components/shop/CatalogFilters'
import { CatalogHero } from '@/components/shop/CatalogHero'

export const revalidate = 300 // Revalidate every 5 minutes

export default async function ShopPage() {
  const products = await getInventory()

  // Get unique categories from products
  const categories = [...new Set(products.map(p => p.MedicationName.split(' ')[0]))]
    .filter(Boolean)
    .sort()

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <CatalogHero productCount={products.length} />

      {/* Main Content */}
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Filters Sidebar */}
        <aside className="hidden lg:block">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-gray-100" />}>
            <CatalogFilters categories={categories} />
          </Suspense>
        </aside>

        {/* Product Grid */}
        <div>
          <Suspense 
            fallback={
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-80 animate-pulse rounded-2xl bg-gray-100" />
                ))}
              </div>
            }
          >
            <ProductGrid products={products} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
