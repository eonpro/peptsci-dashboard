import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * TEMPORARY secret-gated migration runner — DELETE AFTER USE.
 *
 * Exists because prod RDS is IAM-auth + VPC-only (reachable solely from the
 * Vercel runtime), and no admin browser session was available to drive the
 * SUPER_ADMIN runner at /api/admin/db/migrate. Follows the documented pattern
 * in scratchpad Lessons ("PROD SCHEMA CHANGES (cross-account RDS)").
 *
 * Auth: `x-migrate-secret` header must equal MIGRATE_RUNNER_SECRET (set in
 * Vercel env). Fails closed when the env var is unset. Same idempotent
 * semantics as the admin runner: statements run individually; "already exists /
 * does not exist / duplicate" errors are no-ops.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations')

function authorized(request: NextRequest): boolean {
  const secret = process.env.MIGRATE_RUNNER_SECRET
  if (!secret) return false // fail closed
  const given = request.headers.get('x-migrate-secret') ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

function isIgnorableDdlError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('already exists') || m.includes('does not exist') || m.includes('duplicate')
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function probe() {
  if (!prisma) throw new Error('Database is not configured')
  const coaTable = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ProductCoa'
  `
  const retailCols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'RetailOrder'
      AND column_name IN ('paymentStatus', 'stripePaymentIntentId', 'paidAt')
  `
  return {
    productCoaTable: coaTable.length === 1,
    retailOrderPaymentColumns: retailCols.map((c) => c.column_name).sort(),
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return errorResponse('Not found', 404, 'NOT_FOUND')
  try {
    return successResponse(await probe())
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Probe failed')
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return errorResponse('Not found', 404, 'NOT_FOUND')
  if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean }
  if (body?.confirm !== true) {
    return errorResponse('Confirmation required: POST { "confirm": true }', 400, 'CONFIRM_REQUIRED')
  }

  const start = Date.now()
  const results: Array<{
    migration: string
    statements: number
    applied: number
    skipped: number
    error?: string
  }> = []

  try {
    const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true })
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()

    for (const dir of dirs) {
      let sql: string
      try {
        sql = await fs.readFile(path.join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8')
      } catch {
        results.push({ migration: dir, statements: 0, applied: 0, skipped: 0, error: 'sql_not_found' })
        continue
      }

      const statements = splitSqlStatements(sql)
      let applied = 0
      let skipped = 0
      let fatal: string | undefined

      for (const stmt of statements) {
        try {
          await prisma.$executeRawUnsafe(stmt)
          applied += 1
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (isIgnorableDdlError(message)) {
            skipped += 1
          } else {
            fatal = message
            break
          }
        }
      }

      results.push({ migration: dir, statements: statements.length, applied, skipped, ...(fatal ? { error: fatal } : {}) })
      if (fatal) {
        logger.error('[diag-migrate] aborted on migration', { migration: dir, error: fatal })
        break
      }
    }

    const schema = await probe()
    const hadFatal = results.some((r) => r.error && r.error !== 'sql_not_found')
    logger.info('[diag-migrate] run complete', { durationMs: Date.now() - start, hadFatal })

    return successResponse({ success: !hadFatal, durationMs: Date.now() - start, results, schema })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration run failed'
    logger.error('[diag-migrate] error', { message })
    return errorResponse(message)
  }
}
