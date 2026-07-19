import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getStorefrontBySlug, getStorefrontProducts } from '@/lib/storefront'
import { getPublishedCoasBySku } from '@/lib/coa'
import { CoaCertificate } from '@/components/coa/CoaCertificate'

export const dynamic = 'force-dynamic'

export default async function StorefrontProductCoaPage({
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

  // Only surface COAs for products this storefront actually sells.
  const allProducts = await getStorefrontProducts(config.id, { enabledOnly: true })
  const product = allProducts.find(
    (p) => p.sku?.toLowerCase() === decodedSku.toLowerCase() || p.id === decodedSku
  )
  if (!product || !product.sku) return notFound()

  const coas = await getPublishedCoasBySku(
    product.sku,
    (coaId) => `/api/storefront/coa/${coaId}/file`
  )

  const name = product.displayName || product.productName

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href={`/products/${encodeURIComponent(product.sku)}`}
        className="inline-flex items-center gap-2 text-sm mb-6 opacity-60 hover:opacity-100 transition-opacity"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Product
      </Link>

      <div className="mb-8">
        <h1
          className="text-2xl sm:text-3xl font-bold"
          style={{
            fontFamily: config.branding.fonts?.heading
              ? `"${config.branding.fonts.heading}", sans-serif`
              : undefined,
          }}
        >
          Certificate of Analysis
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {name}
          {product.dose ? ` · ${product.dose}` : ''} — supplier certificate summary
        </p>
      </div>

      {coas.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
          No certificate of analysis is available for this product yet.
        </div>
      ) : (
        <div className="space-y-10">
          {coas.map((coa) => (
            <CoaCertificate key={coa.id} data={coa} logoSrc={config.branding.logo} />
          ))}
        </div>
      )}
    </div>
  )
}
