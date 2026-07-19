'use client'

import { Search, FlaskConical, Truck, BadgePercent, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CatalogHeroProps {
  productCount: number
  /** Controlled search bound to the catalog grid. */
  search: string
  onSearchChange: (value: string) => void
  categories: string[]
  selectedCategory: string
  onCategoryChange: (category: string) => void
}

const TRUST = [
  { icon: FlaskConical, label: 'COA on every lot' },
  { icon: Truck, label: 'Free 2-day shipping $500+' },
  { icon: BadgePercent, label: 'Your account pricing applied' },
]

/**
 * Flagship catalog hero: search-first with live category chips wired straight
 * into the grid, plus a compact trust bar. Replaces the old static marketing
 * banner — everything here acts on the catalog below.
 */
export function CatalogHero({
  productCount,
  search,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
}: CatalogHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-linear-to-br from-brand-primary via-[#1a30c0] to-[#0a0e3a] md:rounded-3xl">
      {/* Glow accents */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_45%)]" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />

      <div className="relative px-5 py-7 md:px-10 md:py-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/60">
            Physician catalog · {productCount} products
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight text-white md:text-4xl">
            Research peptides, verified.
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-white/70 md:text-base">
            High-purity lyophilized compounds with third-party certificates of analysis —
            priced for your practice.
          </p>

          {/* Hero search — drives the grid directly */}
          <div className="relative mx-auto mt-6 max-w-xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/50" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by peptide, SKU, or category…"
              aria-label="Search the catalog"
              className="h-12 w-full rounded-2xl border border-white/20 bg-black/25 pl-12 pr-10 text-base text-white placeholder:text-white/45 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-md outline-none transition-colors focus:border-white/50 focus:bg-black/35 md:h-14"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Category chips — live filters */}
          <div className="mt-4 flex items-center justify-center gap-2 overflow-x-auto pb-1 scrollbar-hide md:flex-wrap">
            <button
              type="button"
              onClick={() => onCategoryChange('all')}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                selectedCategory === 'all'
                  ? 'bg-white text-brand-onyx'
                  : 'bg-white/10 text-white/75 hover:bg-white/20 hover:text-white'
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryChange(selectedCategory === cat ? 'all' : cat)}
                className={cn(
                  'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  selectedCategory === cat
                    ? 'bg-white text-brand-onyx'
                    : 'bg-white/10 text-white/75 hover:bg-white/20 hover:text-white'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Trust bar */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-white/10 pt-5">
          {TRUST.map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-2 text-xs font-medium text-white/70 md:text-sm">
              <Icon className="h-4 w-4 text-white/50" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
