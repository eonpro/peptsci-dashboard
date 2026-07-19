'use client'

import { useState } from 'react'
import type { ShopProduct } from '@/lib/types/shop'
import { getShopCategoryBuckets } from '@/lib/shop-categories'
import { BuyAgainStrip } from './BuyAgainStrip'
import { ProductGrid } from './ProductGrid'
import { FlaskConical, Truck, BadgePercent } from 'lucide-react'

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
      {/* Slim page head — part of the page, not a boxed banner */}
      <div className="flex flex-wrap items-end justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Catalog</h1>
          <p className="mt-1 text-sm text-white/50">
            {products.length} research compounds, third-party verified.
          </p>
        </div>
        <div className="hidden items-center gap-5 text-xs font-medium text-white/55 md:flex">
          <span className="flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5 text-brand-primary" /> COA on every lot
          </span>
          <span className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-brand-primary" /> Free 2-day shipping $500+
          </span>
          <span className="flex items-center gap-1.5">
            <BadgePercent className="h-3.5 w-3.5 text-brand-primary" /> Account pricing applied
          </span>
        </div>
      </div>

      {/* One-tap reorders (hidden for first-time buyers) */}
      <BuyAgainStrip />

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
