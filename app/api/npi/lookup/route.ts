import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { cleanNpi, isValidNpi, normalizeNppesResponse } from '@/lib/npi'

export const dynamic = 'force-dynamic'

const NPPES_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1'
const NPPES_TIMEOUT_MS = 8000

// Small in-memory cache (5 min). NPPES data is slow-moving; this also softens
// the federal endpoint's rate limits across our users.
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { at: number; data: unknown }>()

function getCached(key: string): unknown | null {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data
  if (hit) cache.delete(key)
  return null
}

const querySchema = z
  .object({
    number: z.string().trim().optional(),
    name: z.string().trim().max(100).optional(),
    state: z.string().trim().max(2).optional(),
  })
  .refine((d) => d.number || (d.name && d.name.length >= 2), {
    message: 'Provide an NPI number, or a name of at least 2 characters',
  })

async function fetchNppes(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NPPES_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`NPPES responded ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * GET /api/npi/lookup
 *  - ?number=1234567893        → exact NPI lookup (validates check digit first)
 *  - ?name=smith&state=CA      → typeahead by name (last or organization)
 *
 * Server proxy to the public NPPES registry (no key). Auth + rate-limited.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const rl = checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.standard, rl.retryAfter) }
      )
    }

    const parsed = querySchema.safeParse({
      number: request.nextUrl.searchParams.get('number') ?? undefined,
      name: request.nextUrl.searchParams.get('name') ?? undefined,
      state: request.nextUrl.searchParams.get('state') ?? undefined,
    })
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message ?? 'Invalid query', 400, 'VALIDATION_ERROR')
    }

    let url: string
    if (parsed.data.number) {
      const npi = cleanNpi(parsed.data.number)
      if (!isValidNpi(npi)) {
        return errorResponse('That NPI number is not valid', 400, 'NPI_INVALID')
      }
      url = `${NPPES_BASE}&number=${encodeURIComponent(npi)}`
    } else {
      // Name search: query both last_name and organization_name with a wildcard.
      const term = parsed.data.name!.replace(/\*$/, '')
      const params = new URLSearchParams()
      params.set('limit', '10')
      // NPPES treats trailing * as a prefix match.
      params.set('last_name', `${term}*`)
      params.set('organization_name', `${term}*`)
      if (parsed.data.state) params.set('state', parsed.data.state.toUpperCase())
      url = `${NPPES_BASE}&${params.toString()}`
    }

    const cacheKey = url
    let json = getCached(cacheKey)
    if (!json) {
      json = await fetchNppes(url)
      cache.set(cacheKey, { at: Date.now(), data: json })
    }

    const providers = normalizeNppesResponse(json)
    return successResponse({ providers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'NPI lookup failed'
    logger.error('[NPI] lookup error', { message }, error instanceof Error ? error : new Error(message))
    // Don't leak the upstream; a failed lookup shouldn't block onboarding hard.
    return errorResponse('Could not reach the NPI registry. Please try again.', 502, 'NPI_UPSTREAM')
  }
}
