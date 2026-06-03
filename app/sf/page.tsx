import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getStorefrontBySlug, getStorefrontProducts } from '@/lib/storefront'
import { StorefrontCatalog } from '@/components/storefront/StorefrontCatalog'

export const dynamic = 'force-dynamic'

export default async function StorefrontHomePage() {
  const headersList = await headers()
  const slug = headersList.get('x-storefront-slug')
  if (!slug) return notFound()

  const config = await getStorefrontBySlug(slug)
  if (!config || config.status !== 'ACTIVE') return notFound()

  const allProducts = await getStorefrontProducts(config.id, { enabledOnly: true })
  const pricedProducts = allProducts.filter((p) => p.retailPrice !== null)
  const featured = pricedProducts.filter((p) => p.isFeatured)

  return (
    <StorefrontCatalog
      products={pricedProducts}
      featured={featured}
      branding={config.branding}
    />
  )
}
