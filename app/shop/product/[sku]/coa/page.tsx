import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getShopProductBySku } from '@/lib/catalog'
import { getPublishedCoasBySku } from '@/lib/coa'
import { CoaCertificate } from '@/components/coa/CoaCertificate'

export const dynamic = 'force-dynamic'

interface CoaPageProps {
  params: Promise<{ sku: string }>
}

export default async function ProductCoaPage({ params }: CoaPageProps) {
  const { sku } = await params

  const product = await getShopProductBySku(sku)
  const coas = await getPublishedCoasBySku(sku, (coaId) => `/api/shop/coa/${coaId}/file`)

  if (!product && coas.length === 0) notFound()

  return (
    <div className="space-y-8">
      <Link href={`/shop/product/${encodeURIComponent(sku)}`}>
        <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Product
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-white">Certificate of Analysis</h1>
        <p className="text-white/60 text-sm mt-1">
          {product?.name ?? sku}
          {product?.dose ? ` · ${product.dose}` : ''} — supplier certificate summary
        </p>
      </div>

      {coas.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0a0e3a] p-10 text-center text-white/60">
          No certificate of analysis is available for this product yet.
        </div>
      ) : (
        <div className="space-y-10">
          {coas.map((coa) => (
            <CoaCertificate key={coa.id} data={coa} logoSrc="/brand/peptsci-logo-dark.png" />
          ))}
        </div>
      )}
    </div>
  )
}
