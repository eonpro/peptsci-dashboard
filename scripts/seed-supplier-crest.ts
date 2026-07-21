/**
 * Load the Crest Peptide price list (scripts/data/crest-peptide-price-list.csv,
 * their July 2026 "-10%" sheet plus the Tesamorelin 10mg / Ipamorelin 5mg
 * Blend @ $22.50/vial) into Supplier/SupplierPriceItem so the PO generator
 * can price POs from it.
 *
 * Upserts by (supplier, Cat.No), so re-running after a sheet update revises
 * prices in place. For production, use the "Import Price List" button on the
 * PO generator instead (POST /api/admin/suppliers/import) with the same CSV.
 *
 * Run:  npx tsx --env-file=.env.local scripts/seed-supplier-crest.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig, assertLocalOrExplicitOverride } from '../lib/db-url'
import { parseSupplierPriceCsv } from '../lib/supplier-import'

const SUPPLIER_NAME = 'Crest Peptide'
const CSV_PATH = join('scripts', 'data', 'crest-peptide-price-list.csv')

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured (set DATABASE_URL or PGHOST/PGPASSWORD).')
  process.exit(1)
}
assertLocalOrExplicitOverride('seed-supplier-crest')

const pool = new pg.Pool(poolConfig)
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

async function main() {
  const csv = readFileSync(CSV_PATH, 'utf8')
  const { rows, errors } = parseSupplierPriceCsv(csv)

  if (errors.length > 0) {
    console.error('CSV rows with errors (skipped):')
    for (const e of errors) console.error(`  row ${e.rowNumber}: ${e.message}`)
  }
  if (rows.length === 0) {
    console.error('No valid rows parsed — aborting.')
    process.exit(1)
  }

  const supplier = await prisma.supplier.upsert({
    where: { name: SUPPLIER_NAME },
    update: {},
    create: { name: SUPPLIER_NAME },
    select: { id: true },
  })

  let created = 0
  let updated = 0
  for (const row of rows) {
    const data = {
      productName: row.productName,
      dose: row.dose ?? '',
      vialsPerBox: row.vialsPerBox ?? null,
      unitCost: row.unitCost,
      listPrice: row.listPrice ?? null,
    }
    const existing = await prisma.supplierPriceItem.findUnique({
      where: {
        supplierId_supplierSku: { supplierId: supplier.id, supplierSku: row.supplierSku },
      },
      select: { id: true },
    })
    if (existing) {
      await prisma.supplierPriceItem.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await prisma.supplierPriceItem.create({
        data: { supplierId: supplier.id, supplierSku: row.supplierSku, ...data },
      })
      created++
    }
  }

  console.log(
    `${SUPPLIER_NAME}: ${created} items created, ${updated} updated (${rows.length} rows, ${errors.length} skipped).`
  )
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
