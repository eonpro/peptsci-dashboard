import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Liveness/readiness probe. Public + unauthenticated so external uptime
// monitors (and Vercel) can reach it. Returns 200 when the app is up and the
// database is reachable, 503 otherwise. Intentionally leaks no internal detail
// beyond coarse component status.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const startedAt = Date.now()

  let dbOk = false
  let dbLatencyMs: number | null = null

  if (prisma) {
    const dbStart = Date.now()
    try {
      await prisma.$queryRaw`SELECT 1`
      dbOk = true
      dbLatencyMs = Date.now() - dbStart
    } catch {
      dbOk = false
    }
  }

  // Without a DB connection the app can't serve meaningful traffic, so treat an
  // unreachable/unconfigured database as not-ready.
  const healthy = dbOk

  const body = {
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeMs: Math.round(process.uptime() * 1000),
    checks: {
      database: {
        status: dbOk ? 'up' : prisma ? 'down' : 'unconfigured',
        latencyMs: dbLatencyMs,
      },
    },
    responseTimeMs: Date.now() - startedAt,
    version: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  }

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
