import { NextRequest, NextResponse } from 'next/server'
import { getSales } from '@/lib/sales'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic' // Use dynamic rendering for authenticated routes

export async function GET(request: NextRequest) {
  try {
    // Authenticate + authorize: ops sales data is admin-only.
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

    // Fetch data
    const sales = await getSales()

    // Per-user cacheable for a short window (data is already TTL-cached
    // server-side). Lets the dashboard reuse the response across quick
    // navigations without re-pulling the full sales array each time.
    return successResponse(sales, 200, {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
    })
  } catch (error) {
    console.error('Error fetching sales:', error)
    return errorResponse('Failed to fetch sales data')
  }
}
