import { NextRequest, NextResponse } from 'next/server'
import { getSales } from '@/lib/sales'
import { getInventory } from '@/lib/inventory'
import { getPriceSheet } from '@/lib/pricing'
import { globalSearch } from '@/lib/search'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic' // Use dynamic rendering for authenticated routes

const searchQuerySchema = z.object({
  q: z.string().min(2, 'Query must be at least 2 characters').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export async function GET(request: NextRequest) {
  try {
    // Authenticate + authorize: global search spans sales/inventory/pricing
    // (admin ops data), so it is admin-only.
    const { userId, isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }
    if (!isAdmin) {
      return forbiddenResponse()
    }

    // Rate limit check
    const rateLimitKey = getRateLimitKey(request, userId)
    const { limited, remaining, retryAfter } = checkRateLimit(rateLimitKey, RATE_LIMITS.standard)

    if (limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        {
          status: 429,
          headers: getRateLimitHeaders(remaining, RATE_LIMITS.standard, retryAfter),
        }
      )
    }

    // Validate query parameters
    const searchParams = request.nextUrl.searchParams
    const parseResult = searchQuerySchema.safeParse({
      q: searchParams.get('q'),
      limit: searchParams.get('limit'),
    })

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: parseResult.error.errors.map((e) => e.message).join(', '),
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      )
    }

    const { q: query, limit } = parseResult.data

    logger.info('Search request', { query, limit, userId })

    // Fetch data in parallel
    const [sales, inventory, prices] = await Promise.all([
      getSales(),
      getInventory(),
      getPriceSheet(),
    ])

    // Perform search
    const results = globalSearch(query, { sales, inventory, prices }, limit)

    logger.info('Search completed', { query, resultCount: results.length })

    return successResponse({
      query,
      count: results.length,
      results,
    })
  } catch (error) {
    logger.error('Search error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to perform search')
  }
}
