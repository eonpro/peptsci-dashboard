'use client'

import { useState } from 'react'
import type { ShopProduct } from '@/lib/types/shop'
import { CatalogHero } from './CatalogHero'
import { BuyAgainStrip } from './BuyAgainStrip'
import { CatalogFilters } from './CatalogFilters'
import { ProductGrid } from './ProductGrid'

interface CatalogShellProps {
  products: ShopProduct[]
  categories: string[]
}

/**
 * Client shell for the flagship catalog: the hero's search + category chips,
 * the desktop sidebar, and the grid all share one filter state, so every
 * control acts on the same results.
 */
export function CatalogShell({ products, categories }: CatalogShellProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000])
  const [inStockOnly, setInStockOnly] = useState(false)

  return (
    <div className="space-y-8">
      <CatalogHero
        productCount={products.length}
        search={search}
        onSearchChange={setSearch}
        categories={categories}
        selectedCategory={category}
        onCategoryChange={setCategory}
      />

      {/* One-tap reorders (hidden for first-time buyers) */}
      <BuyAgainStrip />

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Filters Sidebar */}
        <aside className="hidden lg:block">
          <CatalogFilters
            categories={categories}
            selectedCategory={category}
            onCategoryChange={setCategory}
            priceRange={priceRange}
            onPriceRangeChange={setPriceRange}
            inStockOnly={inStockOnly}
            onInStockOnlyChange={setInStockOnly}
          />
        </aside>

        {/* Product Grid */}
        <div>
          <ProductGrid
            products={products}
            search={search}
            onSearchChange={setSearch}
            category={category}
            onCategoryChange={setCategory}
            priceRange={priceRange}
            inStockOnly={inStockOnly}
          />
        </div>
      </div>
    </div>
  )
}
