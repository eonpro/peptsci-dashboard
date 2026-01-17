import { NextRequest, NextResponse } from 'next/server'
import { getCompetitors } from '@/lib/sheets'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'

export const revalidate = 300 // 5 minute cache (competitor data changes less frequently)

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
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { 
          status: 429,
          headers: getRateLimitHeaders(remaining, RATE_LIMITS.standard, retryAfter)
        }
      )
    }

    // Fetch data
    const competitors = await getCompetitors()
    
    return successResponse(competitors)
  } catch (error) {
    console.error('Error fetching competitors:', error)
    return errorResponse('Failed to fetch competitor data')
  }
}
