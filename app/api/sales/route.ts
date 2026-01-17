import { NextRequest, NextResponse } from 'next/server'
import { getSales } from '@/lib/sheets'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'

export const revalidate = 60 // 1 minute cache for faster updates

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
    const sales = await getSales()
    
    return successResponse(sales)
  } catch (error) {
    console.error('Error fetching sales:', error)
    return errorResponse('Failed to fetch sales data')
  }
}
