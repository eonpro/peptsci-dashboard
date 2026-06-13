import { NextRequest, NextResponse } from 'next/server'
import { getPricing, getClientPricing } from '@/lib/pricing'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic' // Use dynamic rendering for authenticated routes

export async function GET(request: NextRequest) {
  try {
    // Authenticate. Base SRP pricing is available to any signed-in user (the
    // client storefront-manager needs it), but cost/margin and per-client
    // custom pricing are admin-only — enforced below.
    const { userId, isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }

    // Rate limit check
    const rateLimitKey = getRateLimitKey(request, userId)
    const { limited, remaining, retryAfter } = checkRateLimit(rateLimitKey, RATE_LIMITS.standard)

    if (limited) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          code: 'RATE_LIMITED',
        },
        {
          status: 429,
          headers: getRateLimitHeaders(remaining, RATE_LIMITS.standard, retryAfter),
        }
      )
    }

    // Check for client-specific pricing
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    // Per-client custom pricing is sensitive and admin-managed. Block any
    // attempt to read another client's pricing by id (IDOR protection).
    if (clientId) {
      if (!isAdmin) {
        return forbiddenResponse()
      }
      const result = await getClientPricing(clientId)
      return successResponse(
        { source: result.source, prices: result.prices },
        200,
        { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' }
      )
    }

    const result = await getPricing()

    // Non-admins (e.g. clinic storefront managers) get SRP only — never our
    // unit cost / margin.
    const prices = isAdmin
      ? result.prices
      : result.prices.map(({ unitCost: _unitCost, ...rest }) => rest)

    // Per-user cacheable for a short window. The underlying data is already
    // TTL-cached server-side; this lets the browser reuse the response across
    // quick navigations/polls without a fresh round trip. Manual refreshes use
    // `?t=` + no-store, which bypass this.
    return successResponse(
      {
        source: result.source,
        prices,
      },
      200,
      { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' }
    )
  } catch (error) {
    console.error('Error fetching prices:', error)
    return errorResponse('Failed to fetch price sheet')
  }
}
