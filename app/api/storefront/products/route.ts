import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { getStorefrontBySlug, getStorefrontProducts } from '@/lib/storefront'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')
    if (!slug) return errorResponse('slug parameter is required', 400, 'MISSING_SLUG')

    const config = await getStorefrontBySlug(slug)
    if (!config || config.status !== 'ACTIVE') {
      return errorResponse('Storefront not found', 404, 'NOT_FOUND')
    }

    const featured = searchParams.get('featured') === 'true'
    const products = await getStorefrontProducts(config.id, {
      enabledOnly: true,
      featuredOnly: featured || undefined,
    })

    // Only return products with a retail price set
    const priced = products.filter((p) => p.retailPrice !== null)
    return successResponse(priced)
  } catch (error) {
    logger.error('Error fetching storefront products', {}, error as Error)
    return errorResponse('Failed to load products')
  }
}
