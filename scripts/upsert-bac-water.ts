/**
 * Upsert Bacteriostatic Water (3 mL $5, 10 mL $10, Hospira 30 mL $20).
 *
 * Local by default. To run against a remote DB: ALLOW_REMOTE_SEED=1
 *
 *   npx tsx --env-file=.env.local scripts/upsert-bac-water.ts
 *
 * Production RDS is IAM + VPC only, so this cannot reach it. Use the
 * SUPER_ADMIN route instead: POST /api/admin/products/bac-water-sizes
 * with { "confirm": true } — it runs the same shared upsert.
 */
process.loadEnvFile('.env.local')

import { assertLocalOrExplicitOverride } from '../lib/db-url'
import { upsertBacWaterSizes } from '../lib/shop/bac-water-upsert'

async function main() {
  assertLocalOrExplicitOverride('upsert-bac-water')
  const { prisma } = await import('../lib/prisma')
  if (!prisma) throw new Error('No database connection configured')

  const result = await upsertBacWaterSizes(prisma)
  for (const line of result.created) console.log(`created ${line}`)
  for (const line of result.updated) console.log(`updated ${line}`)
  console.log(`Bacteriostatic water sizes are in the catalog (${result.productName}).`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
