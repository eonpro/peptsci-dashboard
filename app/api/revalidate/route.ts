import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated) {
      return unauthorizedResponse()
    }

    // Rate limit check (use export limits since revalidation is expensive)
    const rateLimitKey = getRateLimitKey(request, userId)
    const { limited, remaining, retryAfter } = checkRateLimit(rateLimitKey, RATE_LIMITS.export)
    
    if (limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { 
          status: 429,
          headers: getRateLimitHeaders(remaining, RATE_LIMITS.export, retryAfter)
        }
      )
    }

    const tag = request.nextUrl.searchParams.get('tag')
    const path = request.nextUrl.searchParams.get('path')

    if (tag) {
      revalidateTag(tag)
      return successResponse({ revalidated: true, tag, now: Date.now() })
    }

    if (path) {
      revalidatePath(path)
      return successResponse({ revalidated: true, path, now: Date.now() })
    }

    // Revalidate all main paths
    revalidatePath('/dashboard')
    revalidatePath('/customers')
    revalidatePath('/inventory')
    revalidatePath('/pricing')
    revalidatePath('/competitors')
    revalidatePath('/profit-loss')
    revalidatePath('/orders-expenses')

    return successResponse({ revalidated: true, all: true, now: Date.now() })
  } catch (error) {
    console.error('Error revalidating:', error)
    return errorResponse('Failed to revalidate cache')
  }
}
