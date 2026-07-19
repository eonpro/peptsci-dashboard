'use client'

import { useState } from 'react'
import type { ShopProduct } from '@/lib/types/shop'
import { getShopCategoryBuckets } from '@/lib/shop-categories'
import { CatalogHeroBanner } from './CatalogHeroBanner'
import { ProductGrid } from './ProductGrid'

interface CatalogShellProps {
  products: ShopProduct[]
}

/**
 * Flagship catalog: slim page head → one-tap reorders → a single sticky
 * toolbar (search / category chips / stock / sort) → full-width grid.
 * One filter state, one search box, no sidebar competing with the chips.
 */
export function CatalogShell({ products }: CatalogShellProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [inStockOnly, setInStockOnly] = useState(false)

  // Curated merchandising buckets — never the raw scientific classifications.
  const buckets = getShopCategoryBuckets(products)

  return (
    <div className="space-y-7">
      {/* Cinematic hero banner */}
      <CatalogHeroBanner />

      {/* Toolbar + full-width grid (grid owns search/chips/sort/stock) */}
      <ProductGrid
        products={products}
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        categories={buckets}
        inStockOnly={inStockOnly}
        onInStockOnlyChange={setInStockOnly}
      />
    </div>
  )
}
