import { NextRequest } from 'next/server'

interface RateLimitConfig {
  interval: number // Time window in milliseconds
  maxRequests: number // Maximum requests per interval
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

export interface RateLimitResult {
  limited: boolean
  remaining: number
  retryAfter?: number
}

// ── Distributed backend (Upstash Redis over REST) ──
// On Vercel each serverless instance has its own memory, so the in-memory
// limiter only bounds per-instance traffic. When UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN are set, limits are enforced globally via an atomic
// INCR + PEXPIRE(NX) fixed window. If Redis is unreachable the check falls
// back to the in-memory limiter (fail-open to per-instance limiting, never to
// unlimited).
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

// In-memory fallback store (single-instance scope).
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

/** Fixed-window check against Upstash Redis. Returns null when unavailable. */
async function checkRateLimitRedis(
  bucketKey: string,
  config: RateLimitConfig
): Promise<RateLimitResult | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null
  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', bucketKey],
        // NX: only set the TTL when the key has none (i.e. window start).
        ['PEXPIRE', bucketKey, config.interval, 'NX'],
        ['PTTL', bucketKey],
      ]),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const rows = (await res.json()) as Array<{ result?: unknown; error?: string }>
    const count = Number(rows?.[0]?.result)
    const ttlMs = Number(rows?.[2]?.result)
    if (!Number.isFinite(count)) return null

    if (count > config.maxRequests) {
      const retryAfter = Number.isFinite(ttlMs) && ttlMs > 0 ? Math.ceil(ttlMs / 1000) : Math.ceil(config.interval / 1000)
      return { limited: true, remaining: 0, retryAfter }
    }
    return { limited: false, remaining: config.maxRequests - count }
  } catch {
    // Network/Redis failure → let the caller fall back to in-memory limiting.
    return null
  }
}

/** Fixed-window check against the per-instance in-memory store. */
function checkRateLimitMemory(bucketKey: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(bucketKey)

  // No existing entry or expired - create new
  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(bucketKey, {
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
  rateLimitStore.set(bucketKey, entry)

  return { limited: false, remaining: config.maxRequests - entry.count }
}

/**
 * Checks if a request should be rate limited.
 * Returns { limited: false } if allowed, { limited: true, retryAfter } if blocked.
 *
 * Uses Upstash Redis (global, multi-instance) when configured; otherwise (or
 * on Redis failure) the in-memory per-instance limiter.
 */
// Throttled alert so a Redis outage is visible in logs without spamming one
// line per request (limits become per-instance ~N× while degraded).
let lastFallbackWarnAt = 0

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = RATE_LIMITS.standard
): Promise<RateLimitResult> {
  // Namespace by config so e.g. `auth` and `standard` checks for the same
  // caller use independent windows.
  const bucketKey = `rl:${config.maxRequests}:${config.interval}:${key}`
  const redis = await checkRateLimitRedis(bucketKey, config)
  if (redis) return redis
  if (UPSTASH_URL && UPSTASH_TOKEN && Date.now() - lastFallbackWarnAt > 60_000) {
    lastFallbackWarnAt = Date.now()
    console.warn(
      '[rate-limit] Upstash Redis unreachable — falling back to per-instance in-memory limiting (global limits degraded)'
    )
  }
  return checkRateLimitMemory(bucketKey, config)
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
