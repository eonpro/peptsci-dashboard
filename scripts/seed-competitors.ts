/**
 * Competitor price seed: populates CompetitorPrice with real research-market
 * prices scraped July 2026, dose-matched to our catalog SRPs (scripts/seed.ts).
 *
 * Upserts by the unique (competitorName, productName, dose) tuple, so re-running
 * updates in place. `diff` is stored as ourSrp - theirPrice (same convention as
 * the CSV importer in app/api/admin/competitors/import/route.ts).
 *
 * IMPORTANT — two market channels are represented:
 *   - "research" vendors sell gray-market "research use only" vials. This is the
 *     true like-for-like market for BPC-157 / TB-500.
 *   - GLP-1s (Semaglutide, Tirzepatide) also list on those research vendors, but
 *     our SRP targets the clinical / compounded-pharmacy channel, so the diff on
 *     those rows will look large. Vendor names carry a "(research)" tag to make
 *     the channel explicit in the competitors table.
 *
 * Run:  npm run seed:competitors
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig, assertLocalOrExplicitOverride } from '../lib/db-url'

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured (set DATABASE_URL or PGHOST/PGPASSWORD).')
  process.exit(1)
}

// Seeds demo/reference data — never allow that against a remote DB by default.
assertLocalOrExplicitOverride('seed-competitors')

const pool = new pg.Pool(poolConfig)
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

/**
 * ourSrp values mirror the catalog SRPs in scripts/seed.ts so the diff is
 * meaningful. theirPrice values are single-vial list prices captured Jul 2026.
 */
interface CompetitorSeedRow {
  competitor: string
  product: string
  dose: string
  theirPrice: number
  ourSrp: number
}

const competitorData: CompetitorSeedRow[] = [
  // ---- BPC-157 (true like-for-like: research channel) ----
  { competitor: 'Alpha BioMed', product: 'BPC-157', dose: '5mg', theirPrice: 46, ourSrp: 45 },
  { competitor: 'Path Peptides', product: 'BPC-157', dose: '5mg', theirPrice: 81, ourSrp: 45 },
  { competitor: 'Research market (median)', product: 'BPC-157', dose: '5mg', theirPrice: 50, ourSrp: 45 },
  { competitor: 'Alpha BioMed', product: 'BPC-157', dose: '10mg', theirPrice: 57, ourSrp: 75 },
  { competitor: 'Path Peptides', product: 'BPC-157', dose: '10mg', theirPrice: 99, ourSrp: 75 },
  { competitor: 'Research market (median)', product: 'BPC-157', dose: '10mg', theirPrice: 65, ourSrp: 75 },

  // ---- TB-500 (true like-for-like: research channel) ----
  { competitor: 'Alpha BioMed', product: 'TB-500', dose: '5mg', theirPrice: 50, ourSrp: 55 },
  { competitor: 'Research market (median)', product: 'TB-500', dose: '5mg', theirPrice: 55, ourSrp: 55 },
  { competitor: 'Alpha BioMed', product: 'TB-500', dose: '10mg', theirPrice: 62, ourSrp: 95 },
  { competitor: 'Research market (median)', product: 'TB-500', dose: '10mg', theirPrice: 95, ourSrp: 95 },

  // ---- Semaglutide (channel mismatch: research vials vs our clinical SRP) ----
  { competitor: 'Welli Labs (research)', product: 'Semaglutide', dose: '5mg', theirPrice: 29.99, ourSrp: 349 },
  { competitor: 'Pepta Labs (research)', product: 'Semaglutide', dose: '5mg', theirPrice: 45.99, ourSrp: 349 },
  { competitor: 'Research market (median)', product: 'Semaglutide', dose: '5mg', theirPrice: 45, ourSrp: 349 },

  // ---- Tirzepatide (channel mismatch: research vials vs our clinical SRP) ----
  { competitor: 'MedsBase (research)', product: 'Tirzepatide', dose: '5mg', theirPrice: 18, ourSrp: 249 },
  { competitor: 'Research market (median)', product: 'Tirzepatide', dose: '5mg', theirPrice: 52, ourSrp: 249 },
  { competitor: 'Research market (median)', product: 'Tirzepatide', dose: '10mg', theirPrice: 65, ourSrp: 449 },
]

async function main() {
  console.log('Seeding competitor prices (research-market data, Jul 2026)...\n')

  let created = 0
  let updated = 0

  for (const row of competitorData) {
    const diff = row.ourSrp - row.theirPrice
    const existing = await prisma.competitorPrice.findUnique({
      where: {
        competitorName_productName_dose: {
          competitorName: row.competitor,
          productName: row.product,
          dose: row.dose,
        },
      },
      select: { id: true },
    })

    if (existing) {
      await prisma.competitorPrice.update({
        where: { id: existing.id },
        data: { theirPrice: row.theirPrice, ourSrp: row.ourSrp, diff },
      })
      updated++
    } else {
      await prisma.competitorPrice.create({
        data: {
          competitorName: row.competitor,
          productName: row.product,
          dose: row.dose,
          theirPrice: row.theirPrice,
          ourSrp: row.ourSrp,
          diff,
        },
      })
      created++
    }

    const sign = diff >= 0 ? '+' : ''
    console.log(
      `  ${row.product} ${row.dose} — ${row.competitor}: $${row.theirPrice} (ours $${row.ourSrp}, diff ${sign}$${diff.toFixed(2)})`
    )
  }

  console.log(`\nSeed complete. ${created} created, ${updated} updated.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
