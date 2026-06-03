/**
 * Seed script: creates a test clinic with an active white-label storefront.
 *
 * Run:  npx tsx scripts/seed-storefront.ts
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding storefront data...\n')

  // 1. Create a User (needed for order attribution)
  const user = await prisma.user.upsert({
    where: { clerkUserId: 'dev-clinic-user' },
    update: {},
    create: {
      clerkUserId: 'dev-clinic-user',
      email: 'clinic@drclinic.com',
      firstName: 'Dr.',
      lastName: 'Clinic',
      role: 'CLIENT',
      status: 'ACTIVE',
    },
  })
  console.log(`  User:  ${user.email} (${user.id})`)

  // 2. Create a Client (the clinic)
  const client = await prisma.client.upsert({
    where: { id: 'test-clinic-001' },
    update: {},
    create: {
      id: 'test-clinic-001',
      organizationName: 'Dr. Clinic Wellness Center',
      contactName: 'Dr. Jane Smith',
      contactEmail: 'clinic@drclinic.com',
      contactPhone: '(555) 123-4567',
      onboardingStatus: 'APPROVED',
    },
  })
  console.log(`  Client: ${client.organizationName} (${client.id})`)

  // Link user to client
  await prisma.user.update({
    where: { id: user.id },
    data: { clientId: client.id },
  })

  // 3. Create products with variants
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
      variants: [
        { sku: 'NAD-NS-100MG', dose: '100mg/mL', unitCost: 30, srp: 89, inventory: 50 },
      ],
    },
    {
      name: 'Glutathione',
      sku: 'GLUT',
      category: 'Anti-Aging',
      description: 'Master antioxidant for detoxification and immune support',
      variants: [
        { sku: 'GLUT-200MG', dose: '200mg/mL', unitCost: 18, srp: 59, inventory: 70 },
      ],
    },
  ]

  const allVariantIds: string[] = []

  for (const pData of productsData) {
    const product = await prisma.product.upsert({
      where: { sku: pData.sku },
      update: { name: pData.name, description: pData.description, category: pData.category },
      create: {
        name: pData.name,
        sku: pData.sku,
        description: pData.description,
        category: pData.category,
        status: 'ACTIVE',
      },
    })

    for (const v of pData.variants) {
      const variant = await prisma.productVariant.upsert({
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
      allVariantIds.push(variant.id)
      console.log(`  Variant: ${v.sku} (${v.dose}) - SRP $${v.srp}`)
    }
  }

  // 4. Create the Storefront
  const storefront = await prisma.storefront.upsert({
    where: { slug: 'drclinic' },
    update: { status: 'ACTIVE' },
    create: {
      clientId: client.id,
      slug: 'drclinic',
      name: 'Dr. Clinic Wellness Shop',
      status: 'ACTIVE',
      brandingConfig: {
        name: 'Dr. Clinic Wellness Shop',
        logo: 'https://static.wixstatic.com/shapes/c49a9b_e45a79daf6b8455aaa0677fce893c05d.svg',
        colors: {
          primary: '#0d9488',
          secondary: '#134e4a',
          accent: '#f59e0b',
          background: '#f8fafc',
          text: '#0f172a',
        },
        fonts: {
          heading: 'Playfair Display',
          body: 'DM Sans',
        },
        hero: {
          title: 'Science-Backed Wellness',
          subtitle: 'Premium peptides and metabolic health solutions, prescribed by Dr. Clinic.',
          cta: 'Browse Products',
        },
        about:
          'Dr. Clinic Wellness Center is a leading provider of peptide therapies and metabolic health solutions. Our treatments are physician-supervised and backed by clinical research.',
        contact: {
          email: 'orders@drclinic.com',
          phone: '(555) 123-4567',
          address: '123 Wellness Blvd, Miami FL 33101',
        },
        footer: {
          text: '© 2026 Dr. Clinic Wellness Center. All rights reserved. For professional use only.',
        },
        socials: [
          { platform: 'Instagram', url: 'https://instagram.com/drclinic' },
          { platform: 'Facebook', url: 'https://facebook.com/drclinic' },
        ],
      },
    },
  })
  console.log(`\n  Storefront: ${storefront.name} (${storefront.slug}.localhost:3000)`)
  console.log(`  Status: ${storefront.status}`)

  // 5. Add all products to the storefront with retail prices
  const retailMarkups: Record<string, { price: number; compareAt?: number; featured: boolean }> = {
    'BPC-157-5MG':   { price: 69.99,  compareAt: 89.99, featured: true },
    'BPC-157-10MG':  { price: 119.99, compareAt: 149.99, featured: true },
    'TB500-5MG':     { price: 84.99,  featured: false },
    'TB500-10MG':    { price: 149.99, featured: false },
    'SEMA-2.5MG':    { price: 299.99, compareAt: 399.99, featured: true },
    'SEMA-5MG':      { price: 549.99, compareAt: 699.99, featured: true },
    'TIRZ-5MG':      { price: 399.99, featured: false },
    'TIRZ-10MG':     { price: 699.99, featured: false },
    'NAD-NS-100MG':  { price: 129.99, compareAt: 159.99, featured: true },
    'GLUT-200MG':    { price: 89.99,  featured: false },
  }

  const variants = await prisma.productVariant.findMany({ select: { id: true, sku: true } })

  let order = 0
  for (const variant of variants) {
    const markup = retailMarkups[variant.sku!]
    if (!markup) continue

    const sp = await prisma.storefrontProduct.upsert({
      where: {
        storefrontId_variantId: {
          storefrontId: storefront.id,
          variantId: variant.id,
        },
      },
      update: {
        isEnabled: true,
        isFeatured: markup.featured,
        displayOrder: order++,
      },
      create: {
        storefrontId: storefront.id,
        variantId: variant.id,
        isEnabled: true,
        isFeatured: markup.featured,
        displayOrder: order++,
      },
    })

    await prisma.storefrontRetailPrice.upsert({
      where: { storefrontProductId: sp.id },
      update: {
        retailPrice: markup.price,
        compareAtPrice: markup.compareAt ?? null,
        isActive: true,
      },
      create: {
        storefrontProductId: sp.id,
        retailPrice: markup.price,
        compareAtPrice: markup.compareAt ?? null,
        isActive: true,
      },
    })

    console.log(
      `  Product: ${variant.sku} -> $${markup.price}${markup.compareAt ? ` (was $${markup.compareAt})` : ''}${markup.featured ? ' ★' : ''}`
    )
  }

  console.log('\n✅ Seed complete!')
  console.log('\n📋 To visit the storefront locally:')
  console.log('   http://drclinic.localhost:3000')
  console.log('   Or: http://localhost:3000?_storefront=drclinic\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
