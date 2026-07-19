'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import type { ShopProduct } from '@/lib/types/shop'
import { filterProducts, getCategories } from '@/lib/types/shop'
import { ProductCard } from './ProductCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Grid, List, SlidersHorizontal, X } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'

// Re-export ShopProduct for convenience
export type { ShopProduct } from '@/lib/types/shop'

interface ProductGridProps {
  products: ShopProduct[]
  /** Controlled search (when the hero/shell owns filter state). */
  search?: string
  onSearchChange?: (value: string) => void
  /** Controlled category (when the desktop sidebar owns filter state). */
  category?: string
  onCategoryChange?: (category: string) => void
  /** Price range filter from the sidebar; [0, 1000] means "no limit". */
  priceRange?: [number, number]
  inStockOnly?: boolean
}

type SortOption = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc'
type ViewMode = 'grid' | 'list'

export function ProductGrid({
  products,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  priceRange,
  inStockOnly,
}: ProductGridProps) {
  const [internalSearch, setInternalSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('name-asc')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [internalCategory, setInternalCategory] = useState<string>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const searchQuery = search ?? internalSearch
  const setSearchQuery = (value: string) => {
    if (onSearchChange) onSearchChange(value)
    else setInternalSearch(value)
  }

  const selectedCategory = category ?? internalCategory
  const setSelectedCategory = (value: string) => {
    if (onCategoryChange) onCategoryChange(value)
    else setInternalCategory(value)
  }

  // Get unique categories
  const categories = useMemo(() => getCategories(products), [products])

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

  // Filter and sort products using unified filter function
  const filteredProducts = useMemo(() => {
    return filterProducts(products, {
      search: searchQuery,
      category: selectedCategory,
      sortBy,
      minPrice: priceRange && priceRange[0] > 0 ? priceRange[0] : undefined,
      // The slider tops out at "$1,000+", so 1000 means unbounded.
      maxPrice: priceRange && priceRange[1] < 1000 ? priceRange[1] : undefined,
      inStockOnly: inStockOnly || undefined,
    })
  }, [products, searchQuery, sortBy, selectedCategory, priceRange, inStockOnly])

  const hasActiveFilters = selectedCategory !== 'all' || searchQuery !== ''
  const activeFilterCount = (selectedCategory !== 'all' ? 1 : 0) + (searchQuery ? 1 : 0)

  return (
    <div className="space-y-4">
      {/* Mobile-first search bar - sticky on mobile */}
      <div className="sticky top-14 md:top-0 z-40 -mx-4 px-4 py-3 bg-brand-onyx/95 backdrop-blur-xl md:relative md:mx-0 md:px-0 md:py-0 md:bg-transparent md:backdrop-blur-none">
        <div className="flex items-center gap-2">
          {/* Search - larger touch target */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
            <Input
              ref={searchInputRef}
              id="catalog-search"
              type="search"
              placeholder="Search peptides..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-12 pr-10 bg-[#0a0e3a] border-white/10 text-white placeholder:text-white/40 rounded-xl text-base"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-white/40 hover:text-white"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Filter button with badge */}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={`Filter and sort${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
                className="h-12 w-12 border-white/20 bg-white/5 text-white hover:bg-white/10 rounded-xl relative"
              >
                <SlidersHorizontal className="h-5 w-5" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-primary text-white text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="h-[85vh] rounded-t-3xl bg-brand-onyx border-t border-white/10 p-0"
            >
              <div className="flex flex-col h-full">
                <SheetHeader className="p-4 border-b border-white/10">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="text-white text-lg">Filter & Sort</SheetTitle>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-brand-primary hover:text-brand-primary/80"
                        onClick={() => {
                          setSearchQuery('')
                          setSelectedCategory('all')
                        }}
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  {/* Sort options */}
                  <div>
                    <h3 className="text-white font-semibold mb-3">Sort by</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'name-asc', label: 'Name (A-Z)' },
                        { value: 'name-desc', label: 'Name (Z-A)' },
                        { value: 'price-asc', label: 'Price: Low to High' },
                        { value: 'price-desc', label: 'Price: High to Low' },
                      ].map((option) => (
                        <Button
                          key={option.value}
                          variant={sortBy === option.value ? 'default' : 'outline'}
                          className={`h-12 rounded-xl justify-start ${
                            sortBy === option.value
                              ? 'bg-brand-primary text-white'
                              : 'border-white/20 text-white/70 hover:bg-white/10'
                          }`}
                          onClick={() => setSortBy(option.value as SortOption)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Category filter */}
                  <div>
                    <h3 className="text-white font-semibold mb-3">Category</h3>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={selectedCategory === 'all' ? 'default' : 'outline'}
                        className={`h-10 rounded-full px-4 ${
                          selectedCategory === 'all'
                            ? 'bg-brand-primary text-white'
                            : 'border-white/20 text-white/70 hover:bg-white/10'
                        }`}
                        onClick={() => setSelectedCategory('all')}
                      >
                        All
                      </Button>
                      {categories.map((cat) => (
                        <Button
                          key={cat}
                          variant={selectedCategory === cat ? 'default' : 'outline'}
                          className={`h-10 rounded-full px-4 ${
                            selectedCategory === cat
                              ? 'bg-brand-primary text-white'
                              : 'border-white/20 text-white/70 hover:bg-white/10'
                          }`}
                          onClick={() => setSelectedCategory(cat)}
                        >
                          {cat}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* View mode */}
                  <div>
                    <h3 className="text-white font-semibold mb-3">View</h3>
                    <div className="flex gap-2">
                      <Button
                        variant={viewMode === 'grid' ? 'default' : 'outline'}
                        className={`flex-1 h-12 rounded-xl ${
                          viewMode === 'grid'
                            ? 'bg-brand-primary text-white'
                            : 'border-white/20 text-white/70 hover:bg-white/10'
                        }`}
                        onClick={() => setViewMode('grid')}
                      >
                        <Grid className="mr-2 h-5 w-5" />
                        Grid
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'outline'}
                        className={`flex-1 h-12 rounded-xl ${
                          viewMode === 'list'
                            ? 'bg-brand-primary text-white'
                            : 'border-white/20 text-white/70 hover:bg-white/10'
                        }`}
                        onClick={() => setViewMode('list')}
                      >
                        <List className="mr-2 h-5 w-5" />
                        List
                      </Button>
                    </div>
                  </div>
                </div>

                <SheetFooter className="p-4 border-t border-white/10">
                  <Button
                    className="w-full h-14 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-2xl text-lg font-semibold"
                    onClick={() => setFiltersOpen(false)}
                  >
                    Show {filteredProducts.length} Results
                  </Button>
                </SheetFooter>
              </div>
            </SheetContent>
          </Sheet>

          {/* View toggle - desktop only */}
          <div className="hidden md:flex items-center border border-white/20 rounded-xl p-1 bg-white/5">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className={`h-10 w-10 rounded-lg ${viewMode === 'grid' ? 'bg-brand-primary text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-5 w-5" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className={`h-10 w-10 rounded-lg ${viewMode === 'list' ? 'bg-brand-primary text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              onClick={() => setViewMode('list')}
            >
              <List className="h-5 w-5" />
            </Button>
          </div>

          {/* Desktop sort */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="hidden md:flex w-[180px] h-12 bg-[#0a0e3a] border-white/10 text-white rounded-xl">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="bg-brand-onyx border-white/10">
              <SelectItem
                value="name-asc"
                className="text-white focus:bg-white/10 focus:text-white"
              >
                Name (A-Z)
              </SelectItem>
              <SelectItem
                value="name-desc"
                className="text-white focus:bg-white/10 focus:text-white"
              >
                Name (Z-A)
              </SelectItem>
              <SelectItem
                value="price-asc"
                className="text-white focus:bg-white/10 focus:text-white"
              >
                Price (Low-High)
              </SelectItem>
              <SelectItem
                value="price-desc"
                className="text-white focus:bg-white/10 focus:text-white"
              >
                Price (High-Low)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active filters chips - mobile */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
            {selectedCategory !== 'all' && (
              <Badge
                variant="secondary"
                className="bg-brand-primary/20 text-brand-primary border-brand-primary/30 px-3 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1.5"
              >
                {selectedCategory}
                <button
                  onClick={() => setSelectedCategory('all')}
                  aria-label={`Clear category filter ${selectedCategory}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {searchQuery && (
              <Badge
                variant="secondary"
                className="bg-white/10 text-white/80 border-white/20 px-3 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1.5"
              >
                &quot;{searchQuery}&quot;
                <button onClick={() => setSearchQuery('')} aria-label="Clear search">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/50">
          {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
        </p>
      </div>

      {/* Product grid/list */}
      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-white/10 p-6 mb-4">
            <Search className="h-10 w-10 text-white/40" />
          </div>
          <h3 className="text-xl font-semibold text-white">No products found</h3>
          <p className="mt-2 text-white/50 max-w-[280px]">
            Try adjusting your search or filters to find what you&apos;re looking for.
          </p>
          <Button
            className="mt-6 h-12 px-6 bg-brand-primary hover:bg-[#1a30c0] text-white rounded-xl"
            onClick={() => {
              setSearchQuery('')
              setSelectedCategory('all')
            }}
          >
            Clear all filters
          </Button>
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
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
