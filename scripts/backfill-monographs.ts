/**
 * Backfill authored peptide monographs onto Product rows.
 *
 * Matches each Product by normalized name to an entry in
 * `lib/content/peptide-monographs.ts` and writes the structured `monograph`
 * JSON (and a default `purity` of "99%" when none is set). Content is only
 * written when a confident name match exists; unmatched products are reported
 * and left untouched.
 *
 * Idempotent: re-running overwrites the monograph with the current authored
 * version. Safe to run repeatedly.
 *
 * Run locally:   npm run backfill:monographs
 * Run vs prod:   ALLOW_REMOTE_SEED=1 npm run backfill:monographs
 * Preview only:  DRY_RUN=1 npm run backfill:monographs
 */
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig, assertLocalOrExplicitOverride } from '../lib/db-url'
import { getMonographForName } from '../lib/content/peptide-monographs'

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured (set DATABASE_URL or PGHOST/PGPASSWORD).')
  process.exit(1)
}

// Writing content to the real catalog is intentional, but must be explicit:
// against a remote DB this requires ALLOW_REMOTE_SEED=1.
assertLocalOrExplicitOverride('backfill-monographs')

const DRY_RUN = process.env.DRY_RUN === '1'
const DEFAULT_PURITY = '99%'

const pool = new pg.Pool(poolConfig)
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, purity: true },
    orderBy: { name: 'asc' },
  })

  let matched = 0
  const unmatched: string[] = []

  for (const p of products) {
    const monograph = getMonographForName(p.name)
    if (!monograph) {
      unmatched.push(p.name)
      continue
    }

    matched++
    if (DRY_RUN) {
      console.log(`[dry-run] would update: ${p.name}`)
      continue
    }

    await prisma.product.update({
      where: { id: p.id },
      data: {
        monograph: monograph as unknown as Prisma.InputJsonValue,
        ...(p.purity ? {} : { purity: DEFAULT_PURITY }),
      },
    })
    console.log(`updated: ${p.name}`)
  }

  console.log('')
  console.log(`Products scanned:  ${products.length}`)
  console.log(`Monographs ${DRY_RUN ? 'to write' : 'written'}: ${matched}`)
  if (unmatched.length > 0) {
    console.log(`No monograph match (${unmatched.length}):`)
    for (const name of unmatched) console.log(`  - ${name}`)
    console.log('Add these to lib/content/peptide-monographs.ts (or an alias) to cover them.')
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
