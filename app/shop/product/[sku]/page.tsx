import { notFound } from 'next/navigation'
import {
  getProductCatalog,
  getShopProductBySku,
  getRelatedShopProducts,
} from '@/lib/catalog'
import { ProductDetailCard, type ProductDetailData } from '@/components/shop/ProductDetailCard'
import { ProductCard } from '@/components/shop/ProductCard'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { getUserMetadata } from '@/lib/roles'
import { applyClientPricing } from '@/lib/shop-pricing'
import type { ShopProduct } from '@/lib/types/shop'

// Client-specific pricing requires per-request auth context.
export const dynamic = 'force-dynamic'

// Sample detailed product data (in production, this would come from Airtable)
const DETAILED_PRODUCTS: Record<string, ProductDetailData> = {
  'bpc-157-tb-500': {
    id: 'bpc-tb-blend-10mg',
    name: 'BPC-157 / TB-500 Blend',
    productType: 'Blend',
    compounds: [
      {
        name: 'BPC-157',
        amount: '5mg',
        casNumber: '137525-51-0',
        molecularFormula: 'C62H98N16O22',
        molecularWeight: '1419.556g/mol',
        purity: '99%',
      },
      {
        name: 'TB-500',
        amount: '5mg',
        casNumber: '77591-33-4',
        molecularFormula: 'C212H350N56O78S',
        molecularWeight: '4963.44g/mol',
        purity: '99%',
      },
    ],
    totalAmount: 'Total 10mg (Blend)',
    imageUrl: 'https://static.wixstatic.com/media/c49a9b_1fd3d9441a0e48aab8d6966be16eda0b~mv2.webp',
    isPRUO: true,
    disclaimer: 'Not for human or veterinary use.',
  },
  'ghk-cu': {
    id: 'ghk-cu-50mg',
    name: 'GHK-Cu',
    productType: 'Single',
    compounds: [
      {
        name: 'GHK-Cu',
        amount: '50mg',
        casNumber: '49557-75-7',
        molecularFormula: 'C14H23CuN6O4',
        molecularWeight: '402.92g/mol',
        purity: '99%',
      },
    ],
    totalAmount: '50mg',
    imageUrl: 'https://static.wixstatic.com/media/c49a9b_8d6a74d35a7c4f0e8d45f19df7c9471b~mv2.webp',
    isPRUO: true,
    disclaimer: 'Not for human or veterinary use.',
  },
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

  // Try to get detailed product data
  const detailedData =
    DETAILED_PRODUCTS[sku.toLowerCase()] ||
    // Try to match by product name
    Object.entries(DETAILED_PRODUCTS).find(([key]) => {
      return product!.name.toLowerCase().includes(key.replace(/-/g, ' ').replace(/-/g, ''))
    })?.[1]

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
          <div className="rounded-3xl bg-gradient-to-br from-[#050722] via-[#0a0e3a] to-[#050722] border border-white/10 p-8">
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
                ${product.displayPrice.toFixed(2)}
              </span>
              {product.isCustomPrice && product.standardPrice && (
                <span className="text-lg text-white/40 line-through">
                  ${product.standardPrice.toFixed(2)}
                </span>
              )}
              <span className="text-white/50">per unit</span>
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

            {/* Add to cart button */}
            <Button
              size="lg"
              className="w-full h-14 bg-[#213cef] hover:bg-[#1a30c0] text-white rounded-xl text-lg font-semibold"
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              Add to Cart
            </Button>

            {/* Volume pricing note */}
            <p className="text-xs text-white/40 text-center mt-4">
              Contact us for volume pricing on orders of 10+ units
            </p>
          </div>

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
