import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

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
        reorderLevel: true,
        product: { select: { name: true, category: true } },
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
        reorderLevel: v.reorderLevel,
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

    let productId: string
    const existingProduct = await prisma.product.findFirst({
      where: { name: { equals: row.name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existingProduct) {
      productId = existingProduct.id
      if (row.category) {
        await prisma.product.update({
          where: { id: existingProduct.id },
          data: { category: row.category },
        })
      }
    } else {
      const created = await prisma.product.create({
        data: { name: row.name, category: row.category ?? null },
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
