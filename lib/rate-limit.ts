import { NextRequest } from 'next/server'

interface RateLimitConfig {
  interval: number // Time window in milliseconds
  maxRequests: number // Maximum requests per interval
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store for rate limiting (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean every minute

/**
 * Default rate limit configurations by route type
 */
export const RATE_LIMITS = {
  // Standard API routes - 100 requests per minute
  standard: { interval: 60000, maxRequests: 100 },
  // Auth routes - 10 requests per minute
  auth: { interval: 60000, maxRequests: 10 },
  // Data export routes - 10 requests per minute
  export: { interval: 60000, maxRequests: 10 },
  // Webhook routes - 1000 requests per minute
  webhook: { interval: 60000, maxRequests: 1000 },
  // Unauthenticated public checkout — strict: creates orders + reserves stock
  publicCheckout: { interval: 60000, maxRequests: 5 },
} as const

/**
 * Extracts a unique identifier for rate limiting from the request.
 * Uses user ID if authenticated, otherwise falls back to IP.
 */
export function getRateLimitKey(request: NextRequest, userId?: string | null): string {
  if (userId) {
    return `user:${userId}`
  }

  // Get IP from various headers (Vercel, Cloudflare, etc.)
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfConnectingIp = request.headers.get('cf-connecting-ip')

  const ip = cfConnectingIp || realIp || forwardedFor?.split(',')[0]?.trim() || 'unknown'
  return `ip:${ip}`
}

/**
 * Checks if a request should be rate limited.
 * Returns { limited: false } if allowed, { limited: true, retryAfter } if blocked.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = RATE_LIMITS.standard
): { limited: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  // No existing entry or expired - create new
  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.interval,
    })
    return { limited: false, remaining: config.maxRequests - 1 }
  }

  // Check if limit exceeded
  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
    return { limited: true, remaining: 0, retryAfter }
  }

  // Increment counter
  entry.count++
  rateLimitStore.set(key, entry)

  return { limited: false, remaining: config.maxRequests - entry.count }
}

/**
 * Creates rate limit headers for the response.
 */
export function getRateLimitHeaders(
  remaining: number,
  config: RateLimitConfig = RATE_LIMITS.standard,
  retryAfter?: number
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': config.maxRequests.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
  }

  if (retryAfter) {
    headers['Retry-After'] = retryAfter.toString()
  }

  return headers
}
