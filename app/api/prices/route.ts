import { NextRequest, NextResponse } from 'next/server'
import { getPricing, getClientPricing } from '@/lib/pricing'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic' // Use dynamic rendering for authenticated routes

export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const { userId, isAuthenticated } = await requireAuth()
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

    // Fetch pricing (from Postgres if available, otherwise Sheets)
    const result = clientId ? await getClientPricing(clientId) : await getPricing()

    // Per-user cacheable for a short window. The underlying data is already
    // TTL-cached server-side; this lets the browser reuse the response across
    // quick navigations/polls without a fresh round trip. Manual refreshes use
    // `?t=` + no-store, which bypass this.
    return successResponse(
      {
        source: result.source,
        prices: result.prices,
      },
      200,
      { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' }
    )
  } catch (error) {
    console.error('Error fetching prices:', error)
    return errorResponse('Failed to fetch price sheet')
  }
}
