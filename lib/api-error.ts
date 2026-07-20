/**
 * Client-side helper: turn a failed fetch Response into an Error carrying the
 * server's ACTUAL message instead of a generic one.
 *
 * Every API route responds with `errorResponse()` (lib/auth.ts), whose 4xx
 * bodies are intentionally user-facing: `{ error, message, code }`. UI code
 * that throws a hardcoded string ("Failed to load X") hides actionable
 * messages like "Insufficient batch stock…" or "That NPI number is already
 * registered…". Use this everywhere a fetch can fail:
 *
 *   const res = await fetch('/api/…')
 *   if (!res.ok) throw await apiError(res, 'Failed to load products')
 *
 * The fallback is used only when the body has no message (network proxies,
 * masked 5xx, non-JSON responses).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Boilerplate values errorResponse() emits that carry no real information. */
const GENERIC_BODY_VALUES = new Set(['Bad Request', 'Internal Server Error', 'An error occurred'])

function meaningful(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || GENERIC_BODY_VALUES.has(trimmed)) return null
  return trimmed
}

export async function apiError(res: Response, fallback: string): Promise<ApiError> {
  const data = (await res.json().catch(() => ({}))) as {
    message?: unknown
    error?: unknown
    code?: unknown
  }
  const message = meaningful(data.message) ?? meaningful(data.error) ?? fallback
  const code = typeof data.code === 'string' ? data.code : null
  return new ApiError(message, res.status, code)
}
