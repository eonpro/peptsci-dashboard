import { Suspense } from 'react'
import { getProductCatalog } from '@/lib/catalog'
import { ProductGrid } from '@/components/shop/ProductGrid'
import { CatalogFilters } from '@/components/shop/CatalogFilters'
import { CatalogHero } from '@/components/shop/CatalogHero'
import { getCategories } from '@/lib/types/shop'
import { getUserMetadata } from '@/lib/roles'
import { applyClientPricing } from '@/lib/shop-pricing'

// Client-specific pricing requires per-request auth context.
export const dynamic = 'force-dynamic'

export default async function ShopPage() {
  // Fetch products from Airtable (falls back to Google Sheets if not configured)
  const { products: catalog, source } = await getProductCatalog()

  // Overlay the viewing client's custom pricing (falls back to SRP).
  const { clientId } = await getUserMetadata()
  const products = await applyClientPricing(catalog, clientId)

  // Get unique categories from products
  const categories = getCategories(products)

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <CatalogHero productCount={products.length} />

      {/* Data source indicator (dev only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-white/30 text-center">Data source: {source}</div>
      )}

      {/* Main Content */}
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Filters Sidebar */}
        <aside className="hidden lg:block">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-white/5" />}>
            <CatalogFilters categories={categories} />
          </Suspense>
        </aside>

        {/* Product Grid */}
        <div>
          <Suspense
            fallback={
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-80 animate-pulse rounded-2xl bg-[#0a0e3a]" />
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
