/**
 * One-off: apply the product-COA + retail-order-payment migrations to
 * PRODUCTION RDS, using the exact same IAM auth path the app runtime uses
 * (PG* + AWS_ROLE_ARN + VERCEL_OIDC_TOKEN pulled via `vercel env pull`).
 *
 * Mirrors app/api/admin/db/migrate semantics: statements run individually and
 * "already exists / does not exist / duplicate" errors are treated as no-ops,
 * so the run is idempotent. Ends with a schema probe.
 *
 * Run: npx tsx --env-file=/tmp/peptsci-prod.env scripts/prod-migrate-ux.ts
 */

import { promises as fs } from 'fs'
import path from 'path'
import pg from 'pg'
import { Signer } from '@aws-sdk/rds-signer'
import { awsCredentialsProvider } from '@vercel/functions/oidc'

const MIGRATIONS = [
  '20260717192353_add_product_coa',
  '20260717203000_add_retail_order_payment',
]

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

async function main() {
  const { PGHOST, PGPORT, PGUSER, PGDATABASE, AWS_REGION, AWS_ROLE_ARN, VERCEL_OIDC_TOKEN } =
    process.env
  if (!PGHOST || !AWS_ROLE_ARN || !VERCEL_OIDC_TOKEN) {
    throw new Error('Missing PGHOST / AWS_ROLE_ARN / VERCEL_OIDC_TOKEN — pull prod env first.')
  }
  console.log(`Target: ${PGUSER}@${PGHOST}:${PGPORT || 5432}/${PGDATABASE} (IAM auth)`)

  const signer = new Signer({
    region: AWS_REGION as string,
    hostname: PGHOST,
    port: Number(PGPORT) || 5432,
    username: PGUSER || 'postgres',
    credentials: awsCredentialsProvider({ roleArn: AWS_ROLE_ARN }),
  })
  const token = await signer.getAuthToken()
  console.log('IAM auth token minted.')

  const client = new pg.Client({
    host: PGHOST,
    port: Number(PGPORT) || 5432,
    user: PGUSER || 'postgres',
    database: PGDATABASE || 'postgres',
    password: token,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })
  await client.connect()
  console.log('Connected.')

  try {
    for (const dir of MIGRATIONS) {
      const sql = await fs.readFile(
        path.join(process.cwd(), 'prisma', 'migrations', dir, 'migration.sql'),
        'utf8'
      )
      const statements = splitSqlStatements(sql)
      let applied = 0
      let skipped = 0
      for (const stmt of statements) {
        try {
          await client.query(stmt)
          applied += 1
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (isIgnorableDdlError(message)) {
            skipped += 1
          } else {
            throw new Error(`FATAL in ${dir}: ${message}\nStatement: ${stmt.slice(0, 200)}`)
          }
        }
      }
      console.log(`${dir}: ${applied} applied, ${skipped} skipped (of ${statements.length})`)
    }

    // ── Probe: same checks the in-app migrate route uses.
    const coaTable = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name='ProductCoa'`
    )
    const retailCols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='RetailOrder'
         AND column_name IN ('paymentStatus','stripePaymentIntentId','paidAt')`
    )
    console.log('\nProbe results:')
    console.log('  ProductCoa table:', coaTable.rows.length === 1 ? 'present' : 'MISSING')
    console.log(
      '  RetailOrder payment columns:',
      retailCols.rows.map((r) => r.column_name).sort().join(', ') || 'MISSING'
    )

    const ok = coaTable.rows.length === 1 && retailCols.rows.length === 3
    console.log(ok ? '\nPROD SCHEMA UP TO DATE ✅' : '\nPROBE INCOMPLETE — check output above ⚠️')
    process.exitCode = ok ? 0 : 1
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('MIGRATION FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})
