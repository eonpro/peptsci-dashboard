/**
 * Applies the BAC-water size plan to the catalog: 3 mL $5, 10 mL $10, and the
 * Hospira 30 mL $20 (the leftover `BAC-H20` row, retitled in place).
 *
 * Server-only. Shared by `scripts/upsert-bac-water.ts` (local/dev) and
 * `app/api/admin/products/bac-water-sizes` (production, where RDS is IAM+VPC
 * only and the CLI cannot reach the database).
 *
 * Idempotent: re-running settles on the same three variants.
 */

import type { PrismaClient } from '@prisma/client'
import {
  BAC_WATER_PRODUCT_NAME,
  BAC_WATER_CATALOG_BLURB,
  isBacteriostaticWaterProduct,
} from './bac-water'
import {
  BAC_WATER_STARTING_INVENTORY,
  planBacWaterVariants,
  type BacWaterVariantPlanStep,
} from './bac-water-plan'

export interface ResolvedBacWaterProduct {
  id: string
  name: string
  created: boolean
}

/** Read-only lookup: the live BAC-water product by name, then by any BAC SKU. */
export async function findBacWaterProduct(prisma: PrismaClient) {
  const byName = await prisma.product.findFirst({
    where: { name: { contains: 'bacteriostatic', mode: 'insensitive' } },
    select: { id: true, name: true, description: true },
  })
  if (byName) return byName

  const viaSku = await prisma.productVariant.findFirst({
    where: {
      OR: [
        { sku: { startsWith: 'BAC-H2O', mode: 'insensitive' } },
        { sku: { startsWith: 'BAC-H20', mode: 'insensitive' } },
        { sku: { startsWith: 'BAC-WATER', mode: 'insensitive' } },
      ],
    },
    select: { productId: true, sku: true },
  })
  if (!viaSku || !isBacteriostaticWaterProduct('', viaSku.sku)) return null

  return prisma.product.findUnique({
    where: { id: viaSku.productId },
    select: { id: true, name: true, description: true },
  })
}

/**
 * Find the live BAC-water product, or create it.
 *
 * The existing name and category are preserved — the storefront already keys
 * off `isBacteriostaticWaterProduct`, so renaming would only churn the catalog
 * heading. Peptide-only spec fields are cleared: water has no purity, CAS,
 * formula, or molecular weight, and the catalog hides those cards for it.
 */
export async function resolveBacWaterProduct(
  prisma: PrismaClient
): Promise<ResolvedBacWaterProduct> {
  const existing = await findBacWaterProduct(prisma)

  if (!existing) {
    const created = await prisma.product.create({
      data: {
        name: BAC_WATER_PRODUCT_NAME,
        category: 'Supplies',
        description: BAC_WATER_CATALOG_BLURB[0],
        intendedUse: 'Research reconstitution',
      },
      select: { id: true, name: true },
    })
    return { id: created.id, name: created.name, created: true }
  }

  const updated = await prisma.product.update({
    where: { id: existing.id },
    data: {
      purity: null,
      casNumber: null,
      molecularFormula: null,
      molecularWeight: null,
      ...(existing.description ? {} : { description: BAC_WATER_CATALOG_BLURB[0] }),
    },
    select: { id: true, name: true },
  })
  return { id: updated.id, name: updated.name, created: false }
}

export interface BacWaterUpsertResult {
  productId: string
  productName: string
  productCreated: boolean
  plan: BacWaterVariantPlanStep[]
  created: string[]
  updated: string[]
}

/** Build the plan for a product's existing variants without writing anything. */
export async function planBacWaterForProduct(
  prisma: PrismaClient,
  productId: string
): Promise<BacWaterVariantPlanStep[]> {
  const siblings = await prisma.productVariant.findMany({
    where: { productId },
    select: { id: true, sku: true, dose: true },
  })
  return planBacWaterVariants(siblings)
}

export async function applyBacWaterPlan(
  prisma: PrismaClient,
  productId: string,
  plan: BacWaterVariantPlanStep[]
): Promise<{ created: string[]; updated: string[] }> {
  const created: string[] = []
  const updated: string[] = []

  for (const step of plan) {
    if (step.action === 'update' && step.variantId) {
      await prisma.productVariant.update({
        where: { id: step.variantId },
        data: {
          sku: step.sku,
          dose: step.dose,
          srp: step.srp,
          unitCost: step.unitCost,
          supplierName: step.supplierName,
          status: 'ACTIVE',
          productId,
        },
      })
      updated.push(`${step.sku} → ${step.dose} @ $${step.srp}`)
      continue
    }

    await prisma.productVariant.create({
      data: {
        productId,
        sku: step.sku,
        dose: step.dose,
        srp: step.srp,
        unitCost: step.unitCost,
        supplierName: step.supplierName,
        inventoryOnHand: BAC_WATER_STARTING_INVENTORY,
        status: 'ACTIVE',
      },
    })
    created.push(`${step.sku} ${step.dose} @ $${step.srp}`)
  }

  return { created, updated }
}

/** Resolve the product, plan its sizes, and write them. */
export async function upsertBacWaterSizes(
  prisma: PrismaClient
): Promise<BacWaterUpsertResult> {
  const product = await resolveBacWaterProduct(prisma)
  const plan = await planBacWaterForProduct(prisma, product.id)
  const { created, updated } = await applyBacWaterPlan(prisma, product.id, plan)
  return {
    productId: product.id,
    productName: product.name,
    productCreated: product.created,
    plan,
    created,
    updated,
  }
}
