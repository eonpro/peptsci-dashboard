/**
 * Apply a single migration.sql to the LOCAL dev database (Prisma CLI-free).
 * Usage: npx tsx --env-file=.env.local scripts/apply-local-migration.ts <migration-dir-name>
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig, assertLocalOrExplicitOverride } from '../lib/db-url'

const dir = process.argv[2]
if (!dir) {
  console.error('Usage: apply-local-migration.ts <migration-dir-name>')
  process.exit(1)
}

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured.')
  process.exit(1)
}
assertLocalOrExplicitOverride('apply-local-migration')

const pool = new pg.Pool(poolConfig)
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const sql = readFileSync(join('prisma', 'migrations', dir, 'migration.sql'), 'utf8')
  const stmts = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const stmt of stmts) {
    await prisma.$executeRawUnsafe(stmt)
  }
  console.log(`applied ${stmts.length} statement(s) from ${dir}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
