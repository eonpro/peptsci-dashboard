import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { getStorefrontBySlug, getStorefrontProducts } from '@/lib/storefront'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')
    if (!slug) return errorResponse('slug parameter is required', 400, 'MISSING_SLUG')

    const config = await getStorefrontBySlug(slug)
    if (!config || config.status !== 'ACTIVE') {
      return errorResponse('Storefront not found', 404, 'NOT_FOUND')
    }

    const { sku } = await params
    const decodedSku = decodeURIComponent(sku)

    const products = await getStorefrontProducts(config.id, { enabledOnly: true })
    const product = products.find(
      (p) => p.sku?.toLowerCase() === decodedSku.toLowerCase()
    )

    if (!product || product.retailPrice === null) {
      return errorResponse('Product not found', 404, 'NOT_FOUND')
    }

    return successResponse(product)
  } catch (error) {
    logger.error('Error fetching storefront product', {}, error as Error)
    return errorResponse('Failed to load product')
  }
}
