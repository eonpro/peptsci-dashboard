import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { getStorefrontBySlug } from '@/lib/storefront'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) return errorResponse('slug parameter is required', 400, 'MISSING_SLUG')

    const config = await getStorefrontBySlug(slug)
    if (!config) return errorResponse('Storefront not found', 404, 'NOT_FOUND')
    if (config.status !== 'ACTIVE') return errorResponse('Storefront is not active', 403, 'INACTIVE')

    return successResponse(config)
  } catch (error) {
    logger.error('Error fetching storefront config', {}, error as Error)
    return errorResponse('Failed to load storefront')
  }
}
