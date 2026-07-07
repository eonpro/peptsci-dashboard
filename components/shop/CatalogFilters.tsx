'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'

interface CatalogFiltersProps {
  categories: string[]
  selectedCategory?: string
  onCategoryChange?: (category: string) => void
}

export function CatalogFilters({
  categories,
  selectedCategory = 'all',
  onCategoryChange,
}: CatalogFiltersProps) {
  const [priceRange, setPriceRange] = useState([0, 1000])
  const [inStockOnly, setInStockOnly] = useState(false)

  const handleCategoryChange = (value: string) => {
    onCategoryChange?.(value)
  }

  const clearFilters = () => {
    onCategoryChange?.('all')
    setPriceRange([0, 1000])
    setInStockOnly(false)
  }

  const hasActiveFilters =
    selectedCategory !== 'all' || priceRange[0] > 0 || priceRange[1] < 1000 || inStockOnly

  return (
    <div className="sticky top-24 space-y-6 rounded-2xl border border-white/10 bg-[#0a0e3a] p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Filters</h2>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-white/50 hover:text-white hover:bg-white/10"
            onClick={clearFilters}
          >
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <Separator className="bg-white/10" />

      {/* Category filter */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-white/80">Category</Label>
        <RadioGroup
          value={selectedCategory}
          onValueChange={handleCategoryChange}
          className="space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="all" className="border-white/30 text-brand-primary" />
            <Label
              htmlFor="all"
              className="font-normal cursor-pointer text-white/70 hover:text-white"
            >
              All Products
            </Label>
          </div>
          {categories.map((category) => (
            <div key={category} className="flex items-center space-x-2">
              <RadioGroupItem
                value={category}
                id={category}
                className="border-white/30 text-brand-primary"
              />
              <Label
                htmlFor={category}
                className="font-normal cursor-pointer text-white/70 hover:text-white"
              >
                {category}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <Separator className="bg-white/10" />

      {/* Price range filter */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-white/80">Price Range</Label>
          <span className="text-sm text-white/50">
            ${priceRange[0]} - ${priceRange[1]}
          </span>
        </div>
        <Slider
          value={priceRange}
          onValueChange={setPriceRange}
          min={0}
          max={1000}
          step={10}
          className="py-4"
        />
        <div className="flex justify-between text-xs text-white/40">
          <span>$0</span>
          <span>$1,000+</span>
        </div>
      </div>

      <Separator className="bg-white/10" />

      {/* Stock filter */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-white/80">Availability</Label>
        <div className="space-y-2">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="h-4 w-4 rounded border-white/30 bg-white/10 text-brand-primary focus:ring-brand-primary"
            />
            <span className="text-sm text-white/70">In stock only</span>
          </label>
        </div>
      </div>

      {/* Active filters summary */}
      {hasActiveFilters && (
        <>
          <Separator className="bg-white/10" />
          <div className="space-y-2">
            <Label className="text-sm font-medium text-white/80">Active Filters</Label>
            <div className="flex flex-wrap gap-2">
              {selectedCategory !== 'all' && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-brand-primary/20 text-brand-primary border-0"
                >
                  {selectedCategory}
                  <button
                    onClick={() => onCategoryChange?.('all')}
                    className="ml-1 hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {(priceRange[0] > 0 || priceRange[1] < 1000) && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-brand-primary/20 text-brand-primary border-0"
                >
                  ${priceRange[0]} - ${priceRange[1]}
                  <button
                    onClick={() => setPriceRange([0, 1000])}
                    className="ml-1 hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {inStockOnly && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-brand-primary/20 text-brand-primary border-0"
                >
                  In Stock
                  <button onClick={() => setInStockOnly(false)} className="ml-1 hover:text-red-400">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
