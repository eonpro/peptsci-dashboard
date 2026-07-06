'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Star, ShoppingCart } from 'lucide-react'
import { useStorefront } from './StorefrontContext'
import type { BrandingConfig, StorefrontProductItem } from '@/lib/types/storefront'

function ProductCard({ product }: { product: StorefrontProductItem }) {
  const { config, addToCart } = useStorefront()
  const branding = config?.branding
  const name = product.displayName || product.productName
  const primaryImage = product.media.find((m) => m.isPrimary)?.url ?? product.media[0]?.url
  const hasValidPrice = typeof product.retailPrice === 'number' && Number.isFinite(product.retailPrice)
  const inStock = product.inventoryOnHand > 0
  const canAdd = inStock && hasValidPrice

  function handleAdd() {
    if (!canAdd || product.retailPrice == null) return
    addToCart({
      storefrontProductId: product.id,
      name,
      sku: product.sku,
      dose: product.dose,
      retailPrice: product.retailPrice,
      quantity: 1,
      image: primaryImage,
    })
  }

  return (
    <div className="group border rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200">
      {/* Image */}
      <Link href={`/products/${encodeURIComponent(product.sku || product.id)}`}>
        <div className="aspect-square bg-gray-50 relative overflow-hidden">
          {primaryImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryImage}
              alt={name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <ShoppingCart className="h-12 w-12" />
            </div>
          )}
          {product.isFeatured && (
            <div
              className="absolute top-2 left-2 px-2 py-1 rounded-full text-white text-xs font-medium flex items-center gap-1"
              style={{ backgroundColor: branding?.colors.accent ?? '#10b981' }}
            >
              <Star className="h-3 w-3" /> Featured
            </div>
          )}
          {product.compareAtPrice && product.retailPrice && product.compareAtPrice > product.retailPrice && (
            <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-red-500 text-white text-xs font-bold">
              {Math.round(((product.compareAtPrice - product.retailPrice) / product.compareAtPrice) * 100)}% OFF
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-4">
        <Link href={`/products/${encodeURIComponent(product.sku || product.id)}`}>
          <h3 className="font-medium text-sm mb-1 line-clamp-2 hover:underline">{name}</h3>
        </Link>
        {product.dose && <p className="text-xs text-gray-500 mb-2">{product.dose}</p>}
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold" style={{ color: branding?.colors.primary }}>
              {hasValidPrice ? `$${product.retailPrice!.toFixed(2)}` : 'Price unavailable'}
            </span>
            {hasValidPrice &&
              product.compareAtPrice &&
              product.retailPrice &&
              product.compareAtPrice > product.retailPrice && (
                <span className="text-sm text-gray-400 line-through">
                  ${product.compareAtPrice.toFixed(2)}
                </span>
              )}
          </div>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="p-2 rounded-lg text-white transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: branding?.colors.primary ?? '#213cef' }}
            title={!inStock ? 'Out of stock' : !hasValidPrice ? 'Price unavailable' : 'Add to cart'}
          >
            <ShoppingCart className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function StorefrontCatalog({
  products,
  featured,
  branding,
}: {
  products: StorefrontProductItem[]
  featured: StorefrontProductItem[]
  branding: BrandingConfig
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[]

  const filtered = products.filter((p) => {
    const name = (p.displayName || p.productName).toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
    const matchCategory = !category || p.category === category
    return matchSearch && matchCategory
  })

  return (
    <div>
      {/* Hero */}
      {branding.hero?.title && (
        <section
          className="relative py-16 sm:py-24"
          style={{
            backgroundColor: branding.colors.primary,
            backgroundImage: branding.hero.backgroundImage
              ? `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4)), url(${branding.hero.backgroundImage})`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="max-w-4xl mx-auto px-4 text-center text-white">
            <h1
              className="text-3xl sm:text-5xl font-bold mb-4"
              style={{
                fontFamily: branding.fonts?.heading
                  ? `"${branding.fonts.heading}", sans-serif`
                  : undefined,
              }}
            >
              {branding.hero.title}
            </h1>
            {branding.hero.subtitle && (
              <p className="text-lg sm:text-xl opacity-90 mb-8">{branding.hero.subtitle}</p>
            )}
            {branding.hero.cta && (
              <a
                href="#products"
                className="inline-block px-8 py-3 rounded-lg font-medium text-sm transition-colors"
                style={{
                  backgroundColor: branding.colors.accent,
                  color: '#fff',
                }}
              >
                {branding.hero.cta}
              </a>
            )}
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: branding.colors.text }}>
            Featured Products
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Catalog */}
      <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: `${branding.colors.text}20`, '--tw-ring-color': branding.colors.primary } as React.CSSProperties}
            />
          </div>
          {categories.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setCategory(null)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  !category ? 'text-white' : 'hover:bg-gray-50'
                }`}
                style={!category ? { backgroundColor: branding.colors.primary, borderColor: branding.colors.primary } : {}}
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    category === c ? 'text-white' : 'hover:bg-gray-50'
                  }`}
                  style={
                    category === c
                      ? { backgroundColor: branding.colors.primary, borderColor: branding.colors.primary }
                      : {}
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No products found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
