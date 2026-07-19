import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getStorefrontBySlug, getStorefrontProducts } from '@/lib/storefront'
import { hasPublishedCoa } from '@/lib/coa'
import { StorefrontProductDetail } from '@/components/storefront/StorefrontProductDetail'

export const dynamic = 'force-dynamic'

export default async function StorefrontProductPage({
  params,
}: {
  params: Promise<{ sku: string }>
}) {
  const headersList = await headers()
  const slug = headersList.get('x-storefront-slug')
  if (!slug) return notFound()

  const config = await getStorefrontBySlug(slug)
  if (!config || config.status !== 'ACTIVE') return notFound()

  const { sku } = await params
  const decodedSku = decodeURIComponent(sku)

  const allProducts = await getStorefrontProducts(config.id, { enabledOnly: true })
  const product = allProducts.find(
    (p) =>
      (p.sku?.toLowerCase() === decodedSku.toLowerCase() || p.id === decodedSku) &&
      p.retailPrice !== null
  )

  if (!product) return notFound()

  const related = allProducts
    .filter((p) => p.id !== product.id && p.category === product.category && p.retailPrice !== null)
    .slice(0, 4)

  const coaHref =
    product.sku && (await hasPublishedCoa(product.sku))
      ? `/products/${encodeURIComponent(product.sku)}/coa`
      : undefined

  return (
    <StorefrontProductDetail
      product={product}
      related={related}
      branding={config.branding}
      coaHref={coaHref}
    />
  )
}
