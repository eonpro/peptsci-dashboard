'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import type { ShopProduct } from '@/lib/types/shop'
import { filterProducts } from '@/lib/types/shop'
import { bucketForProduct, getShopCategoryBuckets } from '@/lib/shop-categories'
import { ProductCard } from './ProductCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Grid, List, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Re-export ShopProduct for convenience
export type { ShopProduct } from '@/lib/types/shop'

interface ProductGridProps {
  products: ShopProduct[]
  /** Controlled search (when the shell owns filter state). */
  search?: string
  onSearchChange?: (value: string) => void
  /** Controlled category bucket. */
  category?: string
  onCategoryChange?: (category: string) => void
  /** Curated bucket list (defaults to buckets derived from products). */
  categories?: string[]
  inStockOnly?: boolean
  onInStockOnlyChange?: (value: boolean) => void
}

type SortOption = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc'
type ViewMode = 'grid' | 'list'

const SORT_LABELS: Record<SortOption, string> = {
  'name-asc': 'Name (A–Z)',
  'name-desc': 'Name (Z–A)',
  'price-asc': 'Price: Low to High',
  'price-desc': 'Price: High to Low',
}

export function ProductGrid({
  products,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  categories: categoriesProp,
  inStockOnly,
  onInStockOnlyChange,
}: ProductGridProps) {
  const [internalSearch, setInternalSearch] = useState('')
  const [internalCategory, setInternalCategory] = useState<string>('all')
  const [internalStock, setInternalStock] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const searchQuery = search ?? internalSearch
  const setSearchQuery = onSearchChange ?? setInternalSearch
  const selectedCategory = category ?? internalCategory
  const setSelectedCategory = onCategoryChange ?? setInternalCategory
  const stockOnly = inStockOnly ?? internalStock
  const setStockOnly = onInStockOnlyChange ?? setInternalStock

  // Merchandising buckets + per-bucket product counts for the chips.
  const categories = useMemo(
    () => categoriesProp ?? getShopCategoryBuckets(products),
    [categoriesProp, products]
  )
  const bucketCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) {
      const b = bucketForProduct(p.category, p.name)
      counts.set(b, (counts.get(b) ?? 0) + 1)
    }
    return counts
  }, [products])

  // Focus the search input when arriving via /shop#search (mobile bottom-nav
  // "Search" tab) — also handles in-page hash re-clicks.
  const searchInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const focusFromHash = () => {
      if (window.location.hash === '#search') {
        searchInputRef.current?.focus()
        searchInputRef.current?.scrollIntoView({ block: 'center' })
      }
    }
    focusFromHash()
    window.addEventListener('hashchange', focusFromHash)
    return () => window.removeEventListener('hashchange', focusFromHash)
  }, [])

  // Category compares merchandising BUCKETS, everything else via filterProducts.
  const filteredProducts = useMemo(() => {
    const base =
      selectedCategory === 'all'
        ? products
        : products.filter((p) => bucketForProduct(p.category, p.name) === selectedCategory)
    return filterProducts(base, {
      search: searchQuery,
      sortBy,
      inStockOnly: stockOnly || undefined,
    })
  }, [products, searchQuery, sortBy, selectedCategory, stockOnly])

  const chip = (value: string, label: string, count?: number) => {
    const active = selectedCategory === value
    return (
      <button
        key={value}
        type="button"
        onClick={() => setSelectedCategory(active && value !== 'all' ? 'all' : value)}
        aria-pressed={active}
        className={cn(
          'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-brand-primary text-white shadow-[0_4px_16px_-4px_rgba(33,60,239,0.7)]'
            : 'bg-white/5 text-white/65 hover:bg-white/10 hover:text-white'
        )}
      >
        {label}
        {typeof count === 'number' && (
          <span
            className={cn(
              'rounded-full px-1.5 text-[11px] font-semibold leading-4',
              active ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'
            )}
          >
            {count}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="space-y-5">
      {/* Sticky toolbar: search / stock / sort / view, then category chips */}
      <div className="sticky top-14 z-40 -mx-4 space-y-3 border-b border-white/10 bg-brand-onyx/95 px-4 py-3 backdrop-blur-xl md:top-16 md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {/* Search */}
          <div className="relative min-w-0 flex-1 basis-64">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              ref={searchInputRef}
              id="catalog-search"
              type="search"
              placeholder="Search peptides, SKUs…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 rounded-full border-white/10 bg-white/5 pl-11 pr-10 text-base text-white placeholder:text-white/40"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 text-white/40 hover:text-white"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* In-stock toggle */}
          <label className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white/70">
            <Switch checked={stockOnly} onCheckedChange={setStockOnly} aria-label="In stock only" />
            In stock
          </label>

          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger
              aria-label="Sort products"
              className="h-11 w-[150px] shrink-0 rounded-full border-white/10 bg-white/5 px-4 text-sm text-white md:w-[190px]"
            >
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-brand-onyx text-white">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((opt) => (
                <SelectItem
                  key={opt}
                  value={opt}
                  className="text-white focus:bg-white/10 focus:text-white"
                >
                  {SORT_LABELS[opt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View toggle (desktop) */}
          <div className="hidden shrink-0 items-center rounded-full border border-white/10 bg-white/5 p-1 md:flex">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              className={cn(
                'h-9 w-9 rounded-full',
                viewMode === 'grid'
                  ? 'bg-brand-primary text-white hover:bg-brand-primary hover:text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              )}
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              className={cn(
                'h-9 w-9 rounded-full',
                viewMode === 'list'
                  ? 'bg-brand-primary text-white hover:bg-brand-primary hover:text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              )}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Category chips with counts */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 scrollbar-hide md:-mx-8 md:px-8">
          {chip('all', 'All', products.length)}
          {categories.map((cat) => chip(cat, cat, bucketCounts.get(cat)))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-white/50" aria-live="polite">
        {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
        {selectedCategory !== 'all' && (
          <>
            {' '}
            in <span className="font-medium text-white/80">{selectedCategory}</span>
          </>
        )}
      </p>

      {/* Product grid/list */}
      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 rounded-full bg-white/10 p-6">
            <Search className="h-10 w-10 text-white/40" />
          </div>
          <h3 className="text-xl font-semibold text-white">No products found</h3>
          <p className="mt-2 max-w-[300px] text-white/50">
            Try a different search{selectedCategory !== 'all' ? ' or category' : ''}.
          </p>
          <Button
            className="mt-6 h-12 rounded-xl bg-brand-primary px-6 text-white hover:bg-[#1a30c0]"
            onClick={() => {
              setSearchQuery('')
              setSelectedCategory('all')
              setStockOnly(false)
            }}
          >
            Clear all filters
          </Button>
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
              : 'space-y-3'
          }
        >
          {filteredProducts.map((product, index) => (
            <ProductCard
              key={`${product.id}-${product.sku}-${index}`}
              product={product}
              viewMode={viewMode}
            />
          ))}
        </div>
      )}
    </div>
  )
}
