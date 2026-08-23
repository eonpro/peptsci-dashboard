/**
 * Upsert Bacteriostatic Water (3 mL $5, 10 mL $10, Hospira 30 mL $20).
 *
 * Local by default. To run against a remote DB: ALLOW_REMOTE_SEED=1
 *
 *   npx tsx --env-file=.env.local scripts/upsert-bac-water.ts
 */
process.loadEnvFile('.env.local')

import { assertLocalOrExplicitOverride } from '../lib/db-url'
import {
  BAC_WATER_PRODUCT_NAME,
  BAC_WATER_SIZES,
  isLegacyBacWaterThirtyMl,
} from '../lib/shop/bac-water'

const UNIT_COST: Record<string, number> = {
  '3mL': 1.5,
  '10mL': 3,
  '30mL': 6,
}

async function main() {
  assertLocalOrExplicitOverride('upsert-bac-water')
  const { prisma } = await import('../lib/prisma')
  if (!prisma) throw new Error('No database connection configured')

  let existing = await prisma.product.findFirst({
    where: { name: { equals: BAC_WATER_PRODUCT_NAME, mode: 'insensitive' } },
  })
  if (!existing) {
    const viaSku = await prisma.productVariant.findFirst({
      where: {
        OR: [
          { sku: { equals: 'BAC-H20', mode: 'insensitive' } },
          { sku: { equals: 'BAC-H2O', mode: 'insensitive' } },
          { sku: { startsWith: 'BAC-H2O', mode: 'insensitive' } },
          { sku: { startsWith: 'BAC-H20', mode: 'insensitive' } },
        ],
      },
    })
    if (viaSku) {
      existing = await prisma.product.findUnique({ where: { id: viaSku.productId } })
    }
  }
  if (!existing) {
    existing = await prisma.product.findFirst({
      where: { name: { contains: 'bacteriostatic', mode: 'insensitive' } },
    })
  }
  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data: {
          name: BAC_WATER_PRODUCT_NAME,
          category: 'Supplies',
          aka: 'BAC Water; BAC-H2O',
          purity: null,
          casNumber: null,
          molecularFormula: null,
          molecularWeight: null,
          description:
            'Sterile bacteriostatic water (0.9% benzyl alcohol) for reconstituting lyophilized research peptides.',
          intendedUse: 'Research reconstitution',
        },
      })
    : await prisma.product.create({
        data: {
          name: BAC_WATER_PRODUCT_NAME,
          category: 'Supplies',
          aka: 'BAC Water; BAC-H2O',
          description:
            'Sterile bacteriostatic water (0.9% benzyl alcohol) for reconstituting lyophilized research peptides.',
          intendedUse: 'Research reconstitution',
        },
      })

  const siblings = await prisma.productVariant.findMany({
    where: { productId: product.id },
  })

  const used = new Set<string>()
  for (const size of BAC_WATER_SIZES) {
    const bySku = siblings.find(
      (v) => !used.has(v.id) && (v.sku || '').toLowerCase() === size.sku.toLowerCase()
    )
    const byDose = siblings.find(
      (v) =>
        !used.has(v.id) &&
        (v.dose || '').replace(/\s+/g, '').toLowerCase() === size.dose.toLowerCase()
    )
    const byLegacy =
      size.dose === '30mL'
        ? siblings.find((v) => !used.has(v.id) && isLegacyBacWaterThirtyMl(v.sku, v.dose))
        : undefined
    const match = bySku || byDose || byLegacy
    const unitCost = UNIT_COST[size.dose] ?? 0
    const supplierName = size.presentation === 'hospira' ? 'Hospira' : null

    if (match) {
      await prisma.productVariant.update({
        where: { id: match.id },
        data: {
          sku: match.sku || size.sku,
          dose: size.dose,
          srp: size.listPrice,
          unitCost,
          supplierName,
          status: 'ACTIVE',
          productId: product.id,
        },
      })
      used.add(match.id)
      console.log(`updated ${match.sku} → ${size.dose} @ $${size.listPrice}`)
    } else {
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: size.sku,
          dose: size.dose,
          srp: size.listPrice,
          unitCost,
          supplierName,
          inventoryOnHand: 50,
          status: 'ACTIVE',
        },
      })
      console.log(`created ${size.sku} ${size.dose} @ $${size.listPrice}`)
    }
  }

  console.log('Bacteriostatic water sizes are in the catalog.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
