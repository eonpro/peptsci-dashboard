'use client'

import { useState } from 'react'
import type { ShopProduct } from '@/lib/types/shop'
import { CatalogFilters } from './CatalogFilters'
import { ProductGrid } from './ProductGrid'

interface CatalogShellProps {
  products: ShopProduct[]
  categories: string[]
}

/**
 * Client shell that shares filter state between the desktop sidebar
 * (CatalogFilters) and the product grid, so sidebar selections actually
 * filter results.
 */
export function CatalogShell({ products, categories }: CatalogShellProps) {
  const [category, setCategory] = useState('all')
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000])
  const [inStockOnly, setInStockOnly] = useState(false)

  return (
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
          category={category}
          onCategoryChange={setCategory}
          priceRange={priceRange}
          inStockOnly={inStockOnly}
        />
      </div>
    </div>
  )
}
