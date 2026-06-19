import { NextRequest } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Admin-only schema migration runner.
 *
 * Why this exists: production connects to RDS using short-lived IAM auth tokens
 * minted at runtime (see lib/db-url.ts). The Prisma migrate CLI can't use that
 * auth and the build environment has no DB URL, so `prisma migrate deploy`
 * cannot run at build/deploy time. This route applies the SQL migrations in
 * prisma/migrations through the live (already-authenticated) runtime connection.
 *
 * Safety:
 *  - Admin only.
 *  - POST requires an explicit { confirm: true } body.
 *  - Statements that fail with "already exists" / "does not exist" / "duplicate"
 *    are treated as no-ops, so the run is idempotent and safe to repeat. Every
 *    other failure aborts and is reported (statements run individually, not in a
 *    single transaction, because Postgres aborts a whole transaction on any
 *    error even when caught).
 */

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations')

function getDb() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

function isIgnorableDdlError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('already exists') ||
    m.includes('does not exist') ||
    m.includes('duplicate')
  )
}

function splitSqlStatements(sql: string): string[] {
  // Our Prisma migrations are plain DDL with no string literals containing ';'
  // and no dollar-quoted blocks, so a simple split is safe. Strip line comments.
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

interface SchemaProbe {
  paymentMethodTable: boolean
  webhookEventTable: boolean
  orderShippingTotalColumn: boolean
  clientStripeCustomerIdColumn: boolean
  shipmentLabelTable: boolean
  packagePhotoTable: boolean
  orderTrackingNumberColumn: boolean
  salesRecordTable: boolean
  competitorPriceTable: boolean
  distributorOrderTable: boolean
  distributorOrderLineTable: boolean
}

async function probeSchema(): Promise<SchemaProbe> {
  const db = getDb()
  const tables = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'PaymentMethod', 'WebhookEvent', 'ShipmentLabel', 'PackagePhoto',
        'SalesRecord', 'CompetitorPrice', 'DistributorOrder', 'DistributorOrderLine'
      )
  `
  const cols = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'Order' AND column_name = 'shippingTotal')
        OR (table_name = 'Order' AND column_name = 'trackingNumber')
        OR (table_name = 'Client' AND column_name = 'stripeCustomerId'))
  `
  const tableNames = new Set(tables.map((t) => t.table_name))
  const colKeys = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`))
  return {
    paymentMethodTable: tableNames.has('PaymentMethod'),
    webhookEventTable: tableNames.has('WebhookEvent'),
    orderShippingTotalColumn: colKeys.has('Order.shippingTotal'),
    clientStripeCustomerIdColumn: colKeys.has('Client.stripeCustomerId'),
    shipmentLabelTable: tableNames.has('ShipmentLabel'),
    packagePhotoTable: tableNames.has('PackagePhoto'),
    orderTrackingNumberColumn: colKeys.has('Order.trackingNumber'),
    salesRecordTable: tableNames.has('SalesRecord'),
    competitorPriceTable: tableNames.has('CompetitorPrice'),
    distributorOrderTable: tableNames.has('DistributorOrder'),
    distributorOrderLineTable: tableNames.has('DistributorOrderLine'),
  }
}

function isSchemaUpToDate(schema: SchemaProbe): boolean {
  return Object.values(schema).every(Boolean)
}

export async function GET() {
  const { isAuthenticated, isAdmin } = await requireAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse()

  try {
    const [migrations, schema] = await Promise.all([listMigrationDirs(), probeSchema()])
    return successResponse({ migrations, schema, upToDate: isSchemaUpToDate(schema) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Schema probe failed'
    logger.error('[DB MIGRATE] probe error', { message })
    return errorResponse(message)
  }
}

export async function POST(request: NextRequest) {
  const { isAuthenticated, isAdmin } = await requireAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse()

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
        logger.error('[DB MIGRATE] aborted on migration', { migration: dir, error: fatal })
        break
      }
    }

    const schema = await probeSchema()
    const upToDate = isSchemaUpToDate(schema)
    const hadFatal = results.some((r) => r.error && r.error !== 'sql_not_found')

    logger.info('[DB MIGRATE] run complete', {
      durationMs: Date.now() - start,
      upToDate,
      hadFatal,
    })

    return successResponse({
      success: !hadFatal && upToDate,
      upToDate,
      durationMs: Date.now() - start,
      results,
      schema,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration run failed'
    logger.error('[DB MIGRATE] error', { message })
    return errorResponse(message)
  }
}
