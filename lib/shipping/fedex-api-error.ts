/**
 * Typed FedEx REST errors. Pure (no Prisma/network) so the tracking poller
 * can abort a 403 once instead of retrying every open shipment.
 */

export class FedExApiError extends Error {
  readonly status: number
  readonly path: string
  readonly code: string | null
  readonly bodySnippet: string

  constructor(opts: { status: number; path: string; body: string }) {
    const snippet = opts.body.slice(0, 200)
    super(`FedEx API error: ${opts.status} - ${snippet}`)
    this.name = 'FedExApiError'
    this.status = opts.status
    this.path = opts.path
    this.code = extractFedExErrorCode(opts.body)
    this.bodySnippet = snippet
  }

  /** OAuth succeeded but this API is not enabled for the project (or sandbox/prod mix). */
  get isForbidden(): boolean {
    return this.status === 403 || this.code === 'FORBIDDEN.ERROR'
  }
}

export function extractFedExErrorCode(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as { errors?: Array<{ code?: unknown }> }
    const code = parsed.errors?.[0]?.code
    if (typeof code === 'string' && code.length > 0) return code
  } catch {
    // Body may be a log line wrapping the JSON payload.
  }
  const match = body.match(/"code"\s*:\s*"([^"]+)"/)
  return match?.[1] ?? null
}

/**
 * A 403 on Track means every subsequent tracking number will fail the same
 * way. Stop the hourly poll instead of logging once per order.
 */
export function shouldAbortTrackingPoll(err: unknown): boolean {
  return err instanceof FedExApiError && err.isForbidden
}
