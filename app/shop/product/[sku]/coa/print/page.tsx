import { notFound } from 'next/navigation'
import { getPublishedCoasBySku } from '@/lib/coa'
import { blendContextFor } from '@/lib/coa-blend'
import { getShopProductBySku } from '@/lib/catalog'
import { CoaPrintDocument } from '@/components/coa/CoaPrintDocument'

export const dynamic = 'force-dynamic'

/**
 * Print-optimized COA view: renders the certificate(s) and auto-opens the
 * browser print dialog so the client can save a PDF. `?coa=<id>` narrows to a
 * single certificate (the dialog's "Download PDF" passes the active one);
 * without it every published certificate prints, one per page.
 */
interface CoaPrintPageProps {
  params: Promise<{ sku: string }>
  searchParams: Promise<{ coa?: string }>
}

export default async function CoaPrintPage({ params, searchParams }: CoaPrintPageProps) {
  const { sku } = await params
  const { coa: coaId } = await searchParams

  const product = await getShopProductBySku(sku)
  let coas = await getPublishedCoasBySku(sku, (id) => `/api/shop/coa/${id}/file`)
  if (coaId) coas = coas.filter((c) => c.id === coaId)
  if (coas.length === 0) notFound()

  const productName = product?.name ?? sku
  const dose = product?.dose ?? null

  return (
    <CoaPrintDocument
      coas={coas}
      blendContextFor={(coa) => blendContextFor(productName, dose, coa.compoundName)}
    />
  )
}
