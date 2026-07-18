import { notFound } from 'next/navigation'
import {
  getProductCatalog,
  getShopProductBySku,
  getRelatedShopProducts,
} from '@/lib/catalog'
import { ProductDetailCard, type ProductDetailData } from '@/components/shop/ProductDetailCard'
import { ProductCard } from '@/components/shop/ProductCard'
import { PdpAddToCart } from '@/components/shop/PdpAddToCart'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { getUserMetadata } from '@/lib/roles'
import { applyClientPricing } from '@/lib/shop-pricing'
import { hasPublishedCoa } from '@/lib/coa'
import { FileCheck2 } from 'lucide-react'
import type { ShopProduct } from '@/lib/types/shop'

// Client-specific pricing requires per-request auth context.
export const dynamic = 'force-dynamic'

/**
 * Build the scientific detail card from the product's real catalog data.
 * Returns null when the product has no scientific fields, in which case the
 * page falls back to a basic info panel.
 */
function buildDetailData(product: ShopProduct): ProductDetailData | null {
  const compounds =
    product.compounds && product.compounds.length > 0
      ? product.compounds
      : product.casNumber || product.molecularFormula || product.molecularWeight
        ? [
            {
              name: product.name,
              amount: product.dose || '',
              casNumber: product.casNumber ?? undefined,
              molecularFormula: product.molecularFormula ?? undefined,
              molecularWeight: product.molecularWeight ?? undefined,
            },
          ]
        : null

  if (!compounds) return null

  const isBlend =
    product.productType === 'Blend' ||
    product.name.toLowerCase().includes('blend') ||
    product.name.includes('/') ||
    product.name.includes('+')

  return {
    id: product.id,
    name: product.name,
    productType: product.productType ?? (isBlend ? 'Blend' : 'Single'),
    compounds,
    totalAmount: product.totalAmount,
    imageUrl: product.images.find((img) => img.isPrimary)?.url ?? product.images[0]?.url,
    category: product.category ?? undefined,
    isPRUO: product.isPRUO ?? true,
    disclaimer: product.disclaimer ?? 'Not for human or veterinary use.',
  }
}

interface ProductPageProps {
  params: Promise<{ sku: string }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { sku } = await params
  const { clientId } = await getUserMetadata()

  // Fast path: fetch just this product (+ a few category peers) instead of the
  // whole catalog. Falls back to a full-catalog fuzzy match when the SKU isn't
  // an exact Airtable SKU (or Airtable isn't the source).
  let product: ShopProduct | undefined
  let relatedProducts: ShopProduct[] = []

  const exact = await getShopProductBySku(sku)
  if (exact) {
    ;[product] = await applyClientPricing([exact], clientId)
    const related = await getRelatedShopProducts(exact.category, exact.sku, 4)
    relatedProducts = await applyClientPricing(related, clientId)
  } else {
    const { products: catalog } = await getProductCatalog()
    const products = await applyClientPricing(catalog, clientId)

    const normalizedSku = sku.toLowerCase().replace(/-/g, '')
    product = products.find((p) => {
      const productSku = p.sku.toLowerCase().replace(/-/g, '')
      const productName = p.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      return productSku.includes(normalizedSku) || productName.includes(normalizedSku)
    })

    if (product) {
      relatedProducts = products
        .filter((p) => p.category === product!.category && p.id !== product!.id)
        .slice(0, 4)
    }
  }

  if (!product) {
    notFound()
  }

  const detailedData = buildDetailData(product)
  const coaAvailable = await hasPublishedCoa(product.sku)

  return (
    <div className="space-y-8">
      {/* Back button */}
      <Link href="/shop">
        <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Catalog
        </Button>
      </Link>

      {/* Product detail section */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Product card (detailed) */}
        {detailedData ? (
          <ProductDetailCard product={detailedData} className="h-fit" />
        ) : (
          /* Fallback to basic card display */
          <div className="rounded-3xl bg-linear-to-br from-brand-onyx via-[#0a0e3a] to-brand-onyx border border-white/10 p-8">
            <h1 className="text-3xl font-bold text-white mb-2">{product.name}</h1>
            <p className="text-xl text-white/60 mb-4">{product.dose}</p>
            {product.description && <p className="text-white/70 mb-6">{product.description}</p>}
            <div className="text-sm text-white/50 space-y-1">
              <p>SKU: {product.sku}</p>
              <p>Category: {product.category || 'Uncategorized'}</p>
            </div>
          </div>
        )}

        {/* Pricing and actions */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-[#0a0e3a] border border-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Pricing</h2>

            {/* Price display */}
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-white">
                {product.displayPrice > 0 ? `$${product.displayPrice.toFixed(2)}` : '—'}
              </span>
              {product.isCustomPrice && product.standardPrice && (
                <span className="text-lg text-white/40 line-through">
                  ${product.standardPrice.toFixed(2)}
                </span>
              )}
              {product.displayPrice > 0 && <span className="text-white/50">per unit</span>}
            </div>
            {product.isCustomPrice && (
              <div className="mb-6 inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
                Your account pricing
              </div>
            )}

            {/* Stock status */}
            <div className="flex items-center gap-2 mb-6">
              <div
                className={`w-2 h-2 rounded-full ${product.inStock !== false ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="text-sm text-white/70">
                {product.inStock !== false ? 'In Stock' : 'Out of Stock'}
              </span>
            </div>

            {/* Add to cart */}
            <PdpAddToCart product={product} />

            {/* Volume pricing note */}
            <p className="text-xs text-white/40 text-center mt-4">
              Contact us for volume pricing on orders of 10+ units
            </p>
          </div>

          {/* Certificate of Analysis */}
          {coaAvailable && (
            <Link href={`/shop/product/${encodeURIComponent(product.sku)}/coa`} className="block">
              <div className="rounded-2xl bg-[#0a0e3a] border border-white/10 p-6 hover:border-brand-primary/60 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/15 text-[#7d90ff]">
                    <FileCheck2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-white">Certificate of Analysis</h2>
                    <p className="text-white/50 text-xs">
                      View the supplier COA — purity, assay, and identity results
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Product specifications */}
          {product.specifications && (
            <div className="rounded-2xl bg-[#0a0e3a] border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Specifications</h2>
              <p className="text-white/70 text-sm whitespace-pre-wrap">{product.specifications}</p>
            </div>
          )}

          {/* Usage instructions */}
          {product.usageInstructions && (
            <div className="rounded-2xl bg-[#0a0e3a] border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Usage Instructions</h2>
              <p className="text-white/70 text-sm whitespace-pre-wrap">
                {product.usageInstructions}
              </p>
            </div>
          )}

          {/* Storage */}
          {product.storageRequirements && (
            <div className="rounded-2xl bg-[#0a0e3a] border border-white/10 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Storage</h2>
              <p className="text-white/70 text-sm">{product.storageRequirements}</p>
            </div>
          )}
        </div>
      </div>

      {/* Related products */}
      {relatedProducts.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-white mb-6">Related Products</h2>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={relatedProduct.id} product={relatedProduct} viewMode="grid" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
