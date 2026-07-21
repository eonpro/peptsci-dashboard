import { Suspense } from 'react'
import { getProductCatalog } from '@/lib/catalog'
import { CatalogShell } from '@/components/shop/CatalogShell'
import { getUserMetadata } from '@/lib/roles'
import { applyClientPricing } from '@/lib/shop-pricing'
import { getSkusWithPublishedCoa } from '@/lib/coa'
import { groupProductsByParent } from '@/lib/types/shop'

// Client-specific pricing requires per-request auth context.
export const dynamic = 'force-dynamic'

export default async function ShopPage() {
  // Variant-level catalog from Postgres (one row per mg size).
  const { products: catalog, source } = await getProductCatalog()

  // Overlay the viewing client's custom pricing (falls back to SRP).
  const { clientId } = await getUserMetadata()
  const products = await applyClientPricing(catalog, clientId)

  // Enrich with COA availability in one grouped query so cards can show the
  // "View COA" link without a per-card check.
  const coaSkus = await getSkusWithPublishedCoa(products.map((p) => p.sku).filter(Boolean))
  const productsWithCoa = products.map((p) => ({ ...p, hasCoa: coaSkus.has(p.sku) }))

  // One card per compound; mg sizes are picked on the product page.
  const groupedProducts = groupProductsByParent(productsWithCoa)

  return (
    <div className="space-y-8">
      {/* Data source indicator (dev only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-white/30 text-center">Data source: {source}</div>
      )}

      {/* Hero + Buy-again + catalog all share one filter state in the shell */}
      <Suspense
        fallback={
          <div className="space-y-8">
            <div className="h-72 animate-pulse rounded-3xl bg-[#0a0e3a]" />
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-80 animate-pulse rounded-2xl bg-[#0a0e3a]" />
              ))}
            </div>
          </div>
        }
      >
        <CatalogShell products={groupedProducts} />
      </Suspense>
    </div>
  )
}
