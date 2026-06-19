import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * TEMPORARY secret-gated migration runner.
 *
 * Why this exists: the canonical runner at /api/admin/db/migrate is Clerk
 * admin-only, and prod RDS (IAM auth) is reachable only from the Vercel
 * runtime — so neither the Prisma CLI nor a laptop can apply migrations. This
 * route lets an operator trigger the SAME idempotent SQL via a one-off curl,
 * gated by the MIGRATE_OPS_SECRET env var. It MUST be deleted (and the env var
 * removed) immediately after the migration is applied.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations')

function authorized(request: NextRequest): boolean {
  const expected = process.env.MIGRATE_OPS_SECRET
  if (!expected || expected.length < 16) return false
  const provided = request.headers.get('x-ops-secret') || ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function getDb() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

function isIgnorableDdlError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('already exists') || m.includes('does not exist') || m.includes('duplicate')
}

function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

async function listMigrationDirs(): Promise<string[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

async function probeNewTables() {
  const db = getDb()
  const tables = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('SalesRecord', 'CompetitorPrice', 'DistributorOrder', 'DistributorOrderLine')
  `
  const set = new Set(tables.map((t) => t.table_name))
  return {
    salesRecordTable: set.has('SalesRecord'),
    competitorPriceTable: set.has('CompetitorPrice'),
    distributorOrderTable: set.has('DistributorOrder'),
    distributorOrderLineTable: set.has('DistributorOrderLine'),
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse('Not found', { status: 404 })
  try {
    const schema = await probeNewTables()
    return NextResponse.json({ schema, upToDate: Object.values(schema).every(Boolean) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'probe failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return new NextResponse('Not found', { status: 404 })

  const start = Date.now()
  const results: Array<{
    migration: string
    statements: number
    applied: number
    skipped: number
    error?: string
  }> = []

  try {
    const dirs = await listMigrationDirs()
    for (const dir of dirs) {
      const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql')
      let sql: string
      try {
        sql = await fs.readFile(sqlPath, 'utf8')
      } catch {
        results.push({ migration: dir, statements: 0, applied: 0, skipped: 0, error: 'sql_not_found' })
        continue
      }

      const statements = splitSqlStatements(sql)
      let applied = 0
      let skipped = 0
      let fatal: string | undefined

      const db = getDb()
      for (const stmt of statements) {
        try {
          await db.$executeRawUnsafe(stmt)
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

      results.push({
        migration: dir,
        statements: statements.length,
        applied,
        skipped,
        ...(fatal ? { error: fatal } : {}),
      })

      if (fatal) {
        logger.error('[OPS MIGRATE] aborted on migration', { migration: dir, error: fatal })
        break
      }
    }

    const schema = await probeNewTables()
    const upToDate = Object.values(schema).every(Boolean)
    const hadFatal = results.some((r) => r.error && r.error !== 'sql_not_found')

    logger.info('[OPS MIGRATE] run complete', { durationMs: Date.now() - start, upToDate, hadFatal })

    return NextResponse.json({
      success: !hadFatal && upToDate,
      upToDate,
      durationMs: Date.now() - start,
      results,
      schema,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'migration failed'
    logger.error('[OPS MIGRATE] error', { message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
