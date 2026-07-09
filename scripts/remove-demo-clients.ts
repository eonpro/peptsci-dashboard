/**
 * One-time cleanup: force-delete the demo/seed clients that the seed scripts
 * (scripts/seed.ts, scripts/seed-storefront.ts) created. These show up in the
 * Client Custom Pricing dropdown and the "Add Custom Price" dialog on the live
 * dashboard even though no real practice has been onboarded.
 *
 * Scope (matched by stable seed Client.id OR organizationName):
 *   - client-wellness-a  "Wellness Clinic A"
 *   - client-medical-b   "Medical Center B"
 *   - client-health-c    "Health Partners C"
 *   - test-clinic-001    "Dr. Clinic Wellness Center"
 *
 * Deliberately does NOT touch "Legacy Orders" (that client holds real migrated
 * order history from scripts/migrate-to-postgres.ts, not demo data).
 *
 * Prefer the live admin UI (Clients → Delete) once DELETE /api/admin/clients/[id]
 * is deployed — this script is for local/ops use only.
 *
 * Local DB:   npx tsx --env-file=.env.local scripts/remove-demo-clients.ts
 * Pass --dry-run to report what would be removed without deleting anything.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig } from '../lib/db-url'
import { deleteClientForce } from '../lib/clients/delete-client'

const DEMO_CLIENT_IDS = ['client-wellness-a', 'client-medical-b', 'client-health-c', 'test-clinic-001']
const DEMO_CLIENT_NAMES = [
  'Wellness Clinic A',
  'Medical Center B',
  'Health Partners C',
  'Dr. Clinic Wellness Center',
]

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured (set DATABASE_URL or PGHOST/PGPASSWORD).')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')

const pool = new pg.Pool(poolConfig)
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log(`Looking up demo clients by id/name...${DRY_RUN ? ' (DRY RUN)' : ''}\n`)

  const clients = await prisma.client.findMany({
    where: {
      OR: [{ id: { in: DEMO_CLIENT_IDS } }, { organizationName: { in: DEMO_CLIENT_NAMES } }],
    },
    select: {
      id: true,
      organizationName: true,
      _count: {
        select: {
          orders: true,
          invoices: true,
          customPricing: true,
          users: true,
          documents: true,
        },
      },
    },
  })

  if (clients.length === 0) {
    console.log('No matching demo clients found. Nothing to delete.')
    return
  }

  console.log(`Found ${clients.length} demo client(s):`)
  for (const c of clients) {
    console.log(
      `  - ${c.organizationName} (${c.id}) ` +
        `[orders=${c._count.orders}, invoices=${c._count.invoices}, ` +
        `pricing=${c._count.customPricing}, users=${c._count.users}, docs=${c._count.documents}]`
    )
  }
  console.log('')

  if (DRY_RUN) {
    console.log('DRY RUN — no rows deleted. Re-run without --dry-run to apply.')
    return
  }

  for (const c of clients) {
    const counts = await deleteClientForce(prisma, c.id)
    console.log(`Deleted ${c.organizationName}:`, counts)
  }

  console.log('\nCleanup complete.')
}

main()
  .catch((e) => {
    console.error('Cleanup failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
