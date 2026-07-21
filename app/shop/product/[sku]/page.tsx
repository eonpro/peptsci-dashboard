import { notFound } from 'next/navigation'
import {
  getProductCatalog,
  getShopProductBySku,
  getSiblingShopProducts,
  getRelatedShopProducts,
} from '@/lib/catalog'
import { groupProductsByParent, type SizeOption } from '@/lib/types/shop'
import { PdpSizeSelector } from '@/components/shop/PdpSizeSelector'
import { ProductDetailCard, type ProductDetailData } from '@/components/shop/ProductDetailCard'
import { ProductCard } from '@/components/shop/ProductCard'
import { ProductVial } from '@/components/shop/ProductVial'
import { ProductMonograph } from '@/components/shop/ProductMonograph'
import { getBlendComposition } from '@/lib/content/blend-compositions'
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
  // Multi-peptide blends have no single CAS/MW; show each component's own
  // verified chemistry instead.
  const blend = getBlendComposition(product.name)

  const compounds = blend
    ? blend.map((c) => ({
        name: c.name,
        amount: '',
        casNumber: c.casNumber,
        molecularFormula: c.molecularFormula,
        molecularWeight: c.molecularWeight,
        purity: c.purity,
      }))
    : product.compounds && product.compounds.length > 0
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
    !!blend ||
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
    aka: product.aka ?? undefined,
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
  let sizeSiblings: ShopProduct[] = []

  const exact = await getShopProductBySku(sku)
  if (exact) {
    ;[product] = await applyClientPricing([exact], clientId)
    // All mg sizes of this compound, with the viewing client's pricing, so
    // the size selector can show per-size prices.
    if (exact.parentProductId) {
      const siblings = await getSiblingShopProducts(exact.parentProductId)
      sizeSiblings = await applyClientPricing(siblings, clientId)
    }
    const related = await getRelatedShopProducts(
      exact.category,
      exact.parentProductId ?? '',
      4
    )
    relatedProducts = groupProductsByParent(await applyClientPricing(related, clientId)).slice(0, 4)
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
      sizeSiblings = products.filter(
        (p) => p.parentProductId && p.parentProductId === product!.parentProductId
      )
      relatedProducts = groupProductsByParent(
        products.filter(
          (p) => p.category === product!.category && p.parentProductId !== product!.parentProductId
        )
      ).slice(0, 4)
    }
  }

  if (!product) {
    notFound()
  }

  // Size picker options — one per sellable mg size of this compound.
  const sizeOptions: SizeOption[] = sizeSiblings.map((s) => ({
    sku: s.sku,
    dose: s.dose,
    displayPrice: s.displayPrice,
    standardPrice: s.standardPrice,
    isCustomPrice: s.isCustomPrice,
    inStock: s.inStock,
    inventoryOnHand: s.inventoryOnHand,
  }))

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
          <ProductDetailCard product={detailedData} vialProduct={product} className="h-fit" />
        ) : (
          /* Fallback to basic card display */
          <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-onyx via-[#0a0e3a] to-brand-onyx border border-white/10 p-8">
            <div className="pr-28 md:pr-36">
              <h1 className="text-3xl font-bold text-white mb-1">{product.name}</h1>
              {product.aka && (
                <p className="text-base text-white/50 mb-2">{product.aka}</p>
              )}
              <p className="text-xl text-white/60 mb-4">{product.dose}</p>
              {product.description && <p className="text-white/70 mb-6">{product.description}</p>}
              <div className="text-sm text-white/50 space-y-1">
                <p>SKU: {product.sku}</p>
                <p>Category: {product.category || 'Uncategorized'}</p>
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-4 right-4 md:bottom-6 md:right-6">
              <ProductVial
                product={product}
                className="h-[200px] drop-shadow-[0_10px_24px_rgba(0,0,0,0.65)]"
              />
            </div>
          </div>
        )}

        {/* Pricing and actions */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-[#0a0e3a] border border-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Pricing</h2>

            {/* Size (mg) picker — each size is its own SKU/price */}
            <PdpSizeSelector options={sizeOptions} currentSku={product.sku} />

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
            {product.isCustomPrice &&
            product.standardPrice &&
            product.standardPrice > product.displayPrice &&
            product.displayPrice > 0 ? (
              <div className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-semibold text-green-400">
                Exclusive practice rate &mdash; you save $
                {(product.standardPrice - product.displayPrice).toFixed(2)} (
                {Math.round(
                  ((product.standardPrice - product.displayPrice) / product.standardPrice) * 100,
                )}
                % off list) per unit
              </div>
            ) : product.isCustomPrice ? (
              <div className="mb-6 inline-flex items-center rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
                Exclusive practice rate
              </div>
            ) : null}

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

      {/* Monograph: Overview, Mechanism of Action, Observations, References */}
      {product.monograph && <ProductMonograph monograph={product.monograph} product={product} />}

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
