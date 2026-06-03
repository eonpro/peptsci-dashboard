/**
 * Core seed: products, variants, clients, and one example client-specific price.
 *
 * Seeds the data needed to develop/test User Roles, Client Pricing, and
 * Members-Only. Deliberately does NOT seed white-label storefront data
 * (deferred to phase 2).
 *
 * Run:  npm run seed
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { getPoolConfig } from '../lib/db-url'

const poolConfig = getPoolConfig()
if (!poolConfig) {
  console.error('No database connection configured (set DATABASE_URL or PGHOST/PGPASSWORD).')
  process.exit(1)
}

const pool = new pg.Pool(poolConfig)
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const productsData = [
  {
    name: 'BPC-157',
    sku: 'BPC-157',
    category: 'Peptides',
    description: 'Body Protection Compound - supports tissue repair and gut health',
    variants: [
      { sku: 'BPC-157-5MG', dose: '5mg', unitCost: 15, srp: 45, inventory: 100 },
      { sku: 'BPC-157-10MG', dose: '10mg', unitCost: 25, srp: 75, inventory: 80 },
    ],
  },
  {
    name: 'TB-500',
    sku: 'TB-500',
    category: 'Peptides',
    description: 'Thymosin Beta 4 - promotes wound healing and recovery',
    variants: [
      { sku: 'TB500-5MG', dose: '5mg', unitCost: 20, srp: 55, inventory: 60 },
      { sku: 'TB500-10MG', dose: '10mg', unitCost: 35, srp: 95, inventory: 45 },
    ],
  },
  {
    name: 'Semaglutide',
    sku: 'SEMA',
    category: 'GLP-1',
    description: 'GLP-1 receptor agonist for metabolic health',
    variants: [
      { sku: 'SEMA-2.5MG', dose: '2.5mg', unitCost: 80, srp: 199, inventory: 30 },
      { sku: 'SEMA-5MG', dose: '5mg', unitCost: 140, srp: 349, inventory: 25 },
    ],
  },
  {
    name: 'Tirzepatide',
    sku: 'TIRZ',
    category: 'GLP-1',
    description: 'Dual GIP/GLP-1 receptor agonist',
    variants: [
      { sku: 'TIRZ-5MG', dose: '5mg', unitCost: 100, srp: 249, inventory: 20 },
      { sku: 'TIRZ-10MG', dose: '10mg', unitCost: 180, srp: 449, inventory: 15 },
    ],
  },
  {
    name: 'NAD+ Nasal Spray',
    sku: 'NAD-NS',
    category: 'Anti-Aging',
    description: 'Nicotinamide adenine dinucleotide for cellular energy',
    variants: [{ sku: 'NAD-NS-100MG', dose: '100mg/mL', unitCost: 30, srp: 89, inventory: 50 }],
  },
  {
    name: 'Glutathione',
    sku: 'GLUT',
    category: 'Anti-Aging',
    description: 'Master antioxidant for detoxification and immune support',
    variants: [{ sku: 'GLUT-200MG', dose: '200mg/mL', unitCost: 18, srp: 59, inventory: 70 }],
  },
]

const clientsData = [
  {
    id: 'client-wellness-a',
    organizationName: 'Wellness Clinic A',
    contactName: 'Dr. Alice Andrews',
    contactEmail: 'orders@wellnessclinica.com',
    contactPhone: '(555) 200-0001',
  },
  {
    id: 'client-medical-b',
    organizationName: 'Medical Center B',
    contactName: 'Dr. Ben Brooks',
    contactEmail: 'purchasing@medcenterb.com',
    contactPhone: '(555) 200-0002',
  },
  {
    id: 'client-health-c',
    organizationName: 'Health Partners C',
    contactName: 'Dr. Carla Cruz',
    contactEmail: 'admin@healthpartnersc.com',
    contactPhone: '(555) 200-0003',
  },
]

async function main() {
  console.log('Seeding core data (products, variants, clients)...\n')

  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { name: p.name, description: p.description, category: p.category },
      create: {
        name: p.name,
        sku: p.sku,
        description: p.description,
        category: p.category,
        status: 'ACTIVE',
      },
    })

    for (const v of p.variants) {
      await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: { dose: v.dose, unitCost: v.unitCost, srp: v.srp, inventoryOnHand: v.inventory },
        create: {
          productId: product.id,
          sku: v.sku,
          dose: v.dose,
          unitCost: v.unitCost,
          srp: v.srp,
          inventoryOnHand: v.inventory,
          status: 'ACTIVE',
        },
      })
    }
    console.log(`  Product: ${p.name} (${p.variants.length} variants)`)
  }

  for (const c of clientsData) {
    await prisma.client.upsert({
      where: { id: c.id },
      update: { organizationName: c.organizationName, contactEmail: c.contactEmail },
      create: {
        id: c.id,
        organizationName: c.organizationName,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        onboardingStatus: 'APPROVED',
      },
    })
    console.log(`  Client:  ${c.organizationName} (${c.id})`)
  }

  // One example client-specific price so shop pricing can be verified end-to-end.
  const semaVariant = await prisma.productVariant.findUnique({ where: { sku: 'SEMA-5MG' } })
  if (semaVariant) {
    await prisma.clientPricing.upsert({
      where: {
        clientId_variantId: { clientId: 'client-wellness-a', variantId: semaVariant.id },
      },
      update: { customPrice: 299, isActive: true },
      create: {
        clientId: 'client-wellness-a',
        variantId: semaVariant.id,
        customPrice: 299,
        discountPercent: 14.3,
        notes: 'Volume agreement (example seed)',
        isActive: true,
      },
    })
    console.log('\n  Example custom price: Wellness Clinic A -> SEMA-5MG @ $299 (SRP $349)')
  }

  console.log('\nSeed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
