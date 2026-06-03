'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShoppingCart, Star, Minus, Plus, Check } from 'lucide-react'
import { useStorefront } from './StorefrontContext'
import type { BrandingConfig, StorefrontProductItem } from '@/lib/types/storefront'

export function StorefrontProductDetail({
  product,
  related,
  branding,
}: {
  product: StorefrontProductItem
  related: StorefrontProductItem[]
  branding: BrandingConfig
}) {
  const { addToCart } = useStorefront()
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const name = product.displayName || product.productName
  const description = product.displayDescription
  const primaryImage = product.media.find((m) => m.isPrimary)?.url ?? product.media[0]?.url

  function handleAdd() {
    addToCart({
      storefrontProductId: product.id,
      name,
      sku: product.sku,
      dose: product.dose,
      retailPrice: product.retailPrice!,
      quantity,
      image: primaryImage,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm mb-6 opacity-60 hover:opacity-100 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Products
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Image */}
        <div className="aspect-square bg-gray-50 rounded-2xl overflow-hidden">
          {primaryImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={primaryImage} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <ShoppingCart className="h-20 w-20" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          {product.category && (
            <span className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: branding.colors.accent }}>
              {product.category}
            </span>
          )}

          <h1
            className="text-2xl sm:text-3xl font-bold mb-2"
            style={{
              fontFamily: branding.fonts?.heading ? `"${branding.fonts.heading}", sans-serif` : undefined,
            }}
          >
            {name}
          </h1>

          {product.dose && <p className="text-sm text-gray-500 mb-4">{product.dose}</p>}

          {/* Price */}
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-3xl font-bold" style={{ color: branding.colors.primary }}>
              ${product.retailPrice?.toFixed(2)}
            </span>
            {product.compareAtPrice && product.retailPrice && product.compareAtPrice > product.retailPrice && (
              <>
                <span className="text-lg text-gray-400 line-through">
                  ${product.compareAtPrice.toFixed(2)}
                </span>
                <span className="text-sm font-medium text-red-500">
                  Save ${(product.compareAtPrice - product.retailPrice).toFixed(2)}
                </span>
              </>
            )}
          </div>

          {product.isFeatured && (
            <div
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-white text-xs font-medium w-fit mb-4"
              style={{ backgroundColor: branding.colors.accent }}
            >
              <Star className="h-3 w-3" /> Featured Product
            </div>
          )}

          {description && (
            <p className="text-sm leading-relaxed text-gray-600 mb-6">{description}</p>
          )}

          {/* Stock status */}
          <p className={`text-sm mb-6 ${product.inventoryOnHand > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {product.inventoryOnHand > 0 ? `In Stock (${product.inventoryOnHand} available)` : 'Out of Stock'}
          </p>

          {/* Add to Cart */}
          <div className="flex items-center gap-4">
            <div className="flex items-center border rounded-lg">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-2.5 hover:bg-gray-50 transition-colors"
                disabled={quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-12 text-center text-sm font-medium">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="p-2.5 hover:bg-gray-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={handleAdd}
              disabled={product.inventoryOnHand <= 0}
              className="flex-1 py-3 px-6 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: branding.colors.primary }}
            >
              {added ? (
                <>
                  <Check className="h-4 w-4" /> Added!
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4" /> Add to Cart
                </>
              )}
            </button>
          </div>

          {/* SKU */}
          {product.sku && (
            <p className="text-xs text-gray-400 mt-6">SKU: {product.sku}</p>
          )}
        </div>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold mb-6">You May Also Like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {related.map((p) => {
              const rName = p.displayName || p.productName
              const rImage = p.media.find((m) => m.isPrimary)?.url ?? p.media[0]?.url
              return (
                <Link
                  key={p.id}
                  href={`/products/${encodeURIComponent(p.sku || p.id)}`}
                  className="border rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-gray-50">
                    {rImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={rImage} alt={rName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-200">
                        <ShoppingCart className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium line-clamp-1">{rName}</p>
                    <p className="text-sm font-bold mt-1" style={{ color: branding.colors.primary }}>
                      ${p.retailPrice?.toFixed(2)}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
