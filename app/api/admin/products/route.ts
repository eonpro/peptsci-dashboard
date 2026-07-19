import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveInventoryActor } from '@/lib/inventory-log'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/products
 * List active product variants (flattened) for admin tooling such as client
 * pricing. Returns one row per variant with product name, dose, SKU, and SRP.
 * Admin only.
 */
export async function GET(_request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) {
      return successResponse({ variants: [] })
    }

    // Project only the columns the response uses (avoids loading every
    // ProductVariant scalar — notes, timestamps, etc. — per row).
    const variants = await prisma.productVariant.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        sku: true,
        dose: true,
        srp: true,
        unitCost: true,
        supplierName: true,
        supplierSku: true,
        inventoryOnHand: true,
        inventoryReserved: true,
        reorderLevel: true,
        _count: { select: { coas: true } },
        product: {
          select: {
            name: true,
            category: true,
            purity: true,
            monograph: true,
            media: {
              where: { isPrimary: true },
              select: { url: true },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
    })

    return successResponse({
      variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        productName: v.product.name,
        category: v.product.category,
        dose: v.dose,
        srp: Number(v.srp),
        unitCost: Number(v.unitCost),
        supplierName: v.supplierName,
        supplierSku: v.supplierSku,
        inventoryOnHand: v.inventoryOnHand,
        inventoryReserved: v.inventoryReserved,
        available: v.inventoryOnHand - v.inventoryReserved,
        reorderLevel: v.reorderLevel,
        imageUrl: v.product.media[0]?.url ?? null,
        coaCount: v._count.coas,
        purity: v.product.purity ?? null,
        monograph: v.product.monograph ?? null,
      })),
    })
  } catch (error) {
    logger.error(
      'Error listing products',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list products')
  }
}

const monographSchema = z.object({
  overview: z.array(z.string()).default([]),
  mechanismOfAction: z.array(z.string()).default([]),
  observations: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
  references: z.array(z.object({ label: z.string(), url: z.string().optional() })).default([]),
  disclaimer: z.string().optional(),
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  sku: z.string().trim().min(1, 'sku is required'),
  dose: z.string().trim().optional(),
  category: z.string().trim().optional(),
  unitCost: z.number().min(0, 'unitCost must be >= 0').default(0),
  srp: z.number().min(0, 'srp must be >= 0').default(0),
  supplierName: z.string().trim().optional(),
  supplierSku: z.string().trim().optional(),
  inventoryOnHand: z.number().int().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(0),
  purity: z.string().trim().nullable().optional(),
  monograph: monographSchema.nullable().optional(),
})

/**
 * POST /api/admin/products
 *
 * Create a single product variant from the "Add Product" dialog. Mirrors the
 * CSV importer's upsert semantics: the parent Product is matched by name
 * (case-insensitive) and created if absent; the variant SKU must be new
 * (409 on duplicate — use edit or CSV re-import to update). Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) {
      return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')
    }

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const row = parsed.data

    const existingVariant = await prisma.productVariant.findUnique({
      where: { sku: row.sku },
      select: { id: true },
    })
    if (existingVariant) {
      return errorResponse(`A product with SKU "${row.sku}" already exists`, 409, 'DUPLICATE_SKU')
    }

    const monographData =
      row.monograph !== undefined
        ? { monograph: row.monograph === null ? Prisma.DbNull : row.monograph }
        : {}
    const purityData = row.purity !== undefined ? { purity: row.purity || null } : {}

    let productId: string
    const existingProduct = await prisma.product.findFirst({
      where: { name: { equals: row.name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existingProduct) {
      productId = existingProduct.id
      const productUpdate = {
        ...(row.category ? { category: row.category } : {}),
        ...monographData,
        ...purityData,
      }
      if (Object.keys(productUpdate).length > 0) {
        await prisma.product.update({
          where: { id: existingProduct.id },
          data: productUpdate,
        })
      }
    } else {
      const created = await prisma.product.create({
        data: { name: row.name, category: row.category ?? null, ...monographData, ...purityData },
        select: { id: true },
      })
      productId = created.id
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: row.sku,
        dose: row.dose || null,
        unitCost: row.unitCost,
        srp: row.srp,
        supplierName: row.supplierName || null,
        supplierSku: row.supplierSku || null,
        inventoryOnHand: row.inventoryOnHand,
        reorderLevel: row.reorderLevel,
      },
      select: { id: true },
    })

    // Every stock movement is audit-logged with the acting user.
    if (row.inventoryOnHand > 0) {
      const actor = await resolveInventoryActor(prisma, userId)
      await prisma.inventoryAdjustment.create({
        data: {
          variantId: variant.id,
          delta: row.inventoryOnHand,
          reason: 'MANUAL_ADJUSTMENT',
          note: 'Initial stock (Add Product)',
          createdById: actor.userId,
          createdByName: actor.name,
        },
      })
    }

    logger.info('Product variant created via UI', {
      variantId: variant.id,
      sku: row.sku,
      by: userId,
    })

    return successResponse({ id: variant.id }, 201)
  } catch (error) {
    logger.error(
      'Error creating product',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to create product')
  }
}
