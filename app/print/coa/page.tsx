import { notFound, redirect } from 'next/navigation'
import { requireAnyPermission } from '@/lib/auth'
import {
  getCoasByVariantId,
  getOrderCoaPack,
  getPublishedCoasBySku,
  type CoaData,
} from '@/lib/coa'
import { blendContextFor, type CoaBlendContext } from '@/lib/coa-blend'
import { prisma } from '@/lib/prisma'
import { displayProductName } from '@/lib/products/named-blends'
import { CoaPrintDocument } from '@/components/coa/CoaPrintDocument'

export const dynamic = 'force-dynamic'

/**
 * Admin print view — no dashboard chrome. Opens the browser print dialog so
 * staff can save a PDF or send pages to the warehouse printer.
 *
 *   /print/coa?variantId=…[&coa=]
 *   /print/coa?orderId=…
 *   /print/coa?sku=…[&coa=]
 */
interface PrintPageProps {
  searchParams: Promise<{ variantId?: string; orderId?: string; sku?: string; coa?: string }>
}

export default async function AdminCoaPrintPage({ searchParams }: PrintPageProps) {
  const auth = await requireAnyPermission('catalog:read', 'fulfillment:read')
  if (!auth.isAuthenticated) redirect('/staff/sign-in?redirect_url=/print/coa')
  if (!auth.allowed) redirect('/staff/wrong-account')

  const { variantId, orderId, sku, coa: coaId } = await searchParams

  let coas: CoaData[] = []
  const contextByCoaId = new Map<string, CoaBlendContext | null>()

  if (orderId) {
    const pack = await getOrderCoaPack(orderId, (id) => `/api/shop/coa/${id}/file`)
    if (!pack) notFound()
    coas = pack.pack.pages.map((c) => ({
      ...c,
      fileUrl: c.hasFile ? `/api/admin/products/${c.variantId}/coa/${c.id}/file` : null,
    }))
    for (const line of pack.lines) {
      for (const c of line.coas) {
        contextByCoaId.set(c.id, blendContextFor(line.productName, line.dose, c.compoundName))
      }
    }
  } else if (variantId) {
    coas = await getCoasByVariantId(
      variantId,
      (id) => `/api/admin/products/${variantId}/coa/${id}/file`
    )
    let productName = ''
    let dose: string | null = null
    if (prisma) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { sku: true, dose: true, product: { select: { name: true } } },
      })
      if (variant) {
        productName = displayProductName(variant.product.name, variant.sku)
        dose = variant.dose
      }
    }
    for (const c of coas) {
      contextByCoaId.set(c.id, blendContextFor(productName, dose, c.compoundName))
    }
  } else if (sku) {
    coas = await getPublishedCoasBySku(sku, (id) => `/api/shop/coa/${id}/file`)
    let productName = ''
    let dose: string | null = null
    if (prisma) {
      const variant = await prisma.productVariant.findFirst({
        where: { sku },
        select: { dose: true, sku: true, product: { select: { name: true } } },
      })
      if (variant) {
        productName = displayProductName(variant.product.name, variant.sku)
        dose = variant.dose
      }
    }
    for (const c of coas) {
      contextByCoaId.set(c.id, blendContextFor(productName, dose, c.compoundName))
    }
  } else {
    notFound()
  }

  if (coaId) coas = coas.filter((c) => c.id === coaId)
  if (coas.length === 0) notFound()

  return (
    <CoaPrintDocument
      coas={coas}
      blendContextFor={(coa) => contextByCoaId.get(coa.id) ?? null}
    />
  )
}
