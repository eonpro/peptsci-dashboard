/**
 * Dev-only: seed a handful of products with full scientific/reference data so
 * the shop product cards can be previewed locally. Mirrors what the catalog
 * CSV import writes (Product scientific fields + ProductVariant commercials).
 * Guarded to local databases via assertLocalOrExplicitOverride.
 */
process.loadEnvFile('.env.local')

import { assertLocalOrExplicitOverride } from '../lib/db-url'

async function main() {
  assertLocalOrExplicitOverride('seed-sci-demo')
  const { prisma } = await import('../lib/prisma')
  if (!prisma) throw new Error('No database connection configured')

  const data = [
    {
      name: 'BPC-157',
      description: 'Body Protection Compound 157, a pentadecapeptide derived from human gastric juice.',
      category: 'Peptides',
      casNumber: '137525-51-0',
      molecularFormula: 'C62H98N16O22',
      molecularWeight: 1419.5,
      pubchemCid: '108101',
      peptideLength: 15,
      aka: 'Bepecin; PL 14736',
      intendedUse: 'Research use only',
      variants: [
        { sku: 'BPC-5', dose: '5mg', unitCost: 18, srp: 55, inventoryOnHand: 40 },
        { sku: 'BPC-10', dose: '10mg', unitCost: 28, srp: 89, inventoryOnHand: 25 },
      ],
    },
    {
      name: 'Tesamorelin',
      description: 'Growth-hormone-releasing hormone (GHRH) analog.',
      category: 'Peptides',
      casNumber: '218949-48-5',
      molecularFormula: 'C221H366N72O67S',
      molecularWeight: 5135.9,
      pubchemCid: '44147413',
      peptideLength: 44,
      aka: 'TH9507; Egrifta',
      intendedUse: 'Research use only',
      variants: [{ sku: 'TES-10', dose: '10mg', unitCost: 45, srp: 129, inventoryOnHand: 18 }],
    },
    {
      name: 'GHK-Cu',
      description: 'Copper peptide complex naturally occurring in human plasma.',
      category: 'Peptides',
      casNumber: '89030-95-5',
      molecularFormula: 'C14H22CuN6O4',
      molecularWeight: 401.9,
      pubchemCid: '91810664',
      peptideLength: 3,
      aka: 'Copper tripeptide-1',
      intendedUse: 'Research use only',
      variants: [{ sku: 'GHK-50', dose: '50mg', unitCost: 22, srp: 69, inventoryOnHand: 32 }],
    },
    {
      name: 'BPC-157 / TB-500 Blend',
      description: 'Research blend of BPC-157 and Thymosin Beta-4 fragment.',
      category: 'Blends',
      casNumber: null,
      molecularFormula: null,
      molecularWeight: null,
      pubchemCid: null,
      peptideLength: null,
      aka: null,
      intendedUse: 'Research use only',
      variants: [{ sku: 'BPC-TB-10', dose: '10mg', unitCost: 42, srp: 119, inventoryOnHand: 12 }],
    },
  ]

  // Demo vial photos (served from public/demo-products in local dev)
  const imageByName: Record<string, string> = {
    'BPC-157': '/demo-products/vial-bpc157.png',
    Tesamorelin: '/demo-products/vial-tesamorelin.png',
    'GHK-Cu': '/demo-products/vial-ghkcu.png',
  }

  for (const p of data) {
    const { variants, ...productData } = p
    const existing = await prisma.product.findFirst({ where: { name: p.name } })
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data: productData })
      : await prisma.product.create({ data: productData })

    const imageUrl = imageByName[p.name]
    if (imageUrl) {
      const primary = await prisma.productMedia.findFirst({
        where: { productId: product.id, isPrimary: true },
      })
      if (primary) {
        await prisma.productMedia.update({
          where: { id: primary.id },
          data: { url: imageUrl, altText: p.name },
        })
      } else {
        await prisma.productMedia.create({
          data: { productId: product.id, url: imageUrl, altText: p.name, isPrimary: true },
        })
      }
    }

    for (const v of variants) {
      await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: { ...v, productId: product.id, status: 'ACTIVE' },
        create: { ...v, productId: product.id, status: 'ACTIVE' },
      })
    }
    console.log(`seeded: ${p.name} (${variants.length} variant(s))`)
  }

  const count = await prisma.productVariant.count({ where: { status: 'ACTIVE' } })
  console.log('active variants now:', count)
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
