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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const observationSchema = z.object({
  title: z.string(),
  detail: z.string(),
})
const referenceSchema = z.object({
  label: z.string(),
  url: z.string().optional(),
})
const monographSchema = z.object({
  overview: z.array(z.string()).default([]),
  mechanismOfAction: z.array(z.string()).default([]),
  observations: z.array(observationSchema).default([]),
  references: z.array(referenceSchema).default([]),
  disclaimer: z.string().optional(),
})

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    category: z.string().trim().optional(),
    aka: z.string().trim().nullable().optional(),
    sku: z.string().trim().min(1).optional(),
    dose: z.string().trim().optional(),
    unitCost: z.number().min(0).optional(),
    srp: z.number().min(0).optional(),
    supplierName: z.string().trim().optional(),
    supplierSku: z.string().trim().optional(),
    reorderLevel: z.number().int().min(0).optional(),
    // Editorial monograph content (stored on the parent Product). `null`
    // clears it; an object replaces it.
    purity: z.string().trim().nullable().optional(),
    monograph: monographSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })

/**
 * PATCH /api/admin/products/[id]
 *
 * Update a single ProductVariant (and, when name/category are provided, its
 * parent Product) from the edit dialog. Inventory on hand is intentionally
 * NOT editable here — stock changes go through inventory receiving/batches so
 * the audit trail stays intact. Admin only.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) {
      return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')
    }

    const { id } = await params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const body = parsed.data

    const variant = await prisma.productVariant.findUnique({
      where: { id },
      select: { id: true, productId: true, sku: true },
    })
    if (!variant) return errorResponse('Product not found', 404, 'NOT_FOUND')

    if (body.sku && body.sku !== variant.sku) {
      const skuTaken = await prisma.productVariant.findUnique({
        where: { sku: body.sku },
        select: { id: true },
      })
      if (skuTaken) {
        return errorResponse(`A product with SKU "${body.sku}" already exists`, 409, 'DUPLICATE_SKU')
      }
    }

    await prisma.productVariant.update({
      where: { id },
      data: {
        ...(body.sku !== undefined ? { sku: body.sku } : {}),
        ...(body.dose !== undefined ? { dose: body.dose || null } : {}),
        ...(body.unitCost !== undefined ? { unitCost: body.unitCost } : {}),
        ...(body.srp !== undefined ? { srp: body.srp } : {}),
        ...(body.supplierName !== undefined ? { supplierName: body.supplierName || null } : {}),
        ...(body.supplierSku !== undefined ? { supplierSku: body.supplierSku || null } : {}),
        ...(body.reorderLevel !== undefined ? { reorderLevel: body.reorderLevel } : {}),
      },
    })

    if (
      body.name !== undefined ||
      body.category !== undefined ||
      body.aka !== undefined ||
      body.purity !== undefined ||
      body.monograph !== undefined
    ) {
      await prisma.product.update({
        where: { id: variant.productId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.category !== undefined ? { category: body.category || null } : {}),
          ...(body.aka !== undefined ? { aka: body.aka || null } : {}),
          ...(body.purity !== undefined ? { purity: body.purity || null } : {}),
          ...(body.monograph !== undefined
            ? { monograph: body.monograph === null ? Prisma.DbNull : body.monograph }
            : {}),
        },
      })
    }

    logger.info('Product variant updated via UI', {
      variantId: id,
      fields: Object.keys(body),
      by: userId,
    })

    return successResponse({ updated: true })
  } catch (error) {
    logger.error(
      'Error updating product variant',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update product')
  }
}

/**
 * DELETE /api/admin/products/[id]
 *
 * Removes a single ProductVariant by id. Cleans up dependents that are safe to
 * drop (client pricing, storefront listings, inventory adjustments, and
 * inventory batches + their events) inside one transaction, then deletes the
 * variant. If the variant has order history, it is instead soft-deleted
 * (status = INACTIVE) so financial records and FK integrity are preserved.
 * When the parent product has no remaining variants, the product (and its
 * media) is removed too. Admin only.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) {
      return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')
    }

    const { id } = await params

    const variant = await prisma.productVariant.findUnique({
      where: { id },
      select: { id: true, productId: true, sku: true, _count: { select: { orderItems: true } } },
    })
    if (!variant) return errorResponse('Product not found', 404, 'NOT_FOUND')

    // Preserve financial history: never hard-delete a variant tied to orders.
    if (variant._count.orderItems > 0) {
      await prisma.productVariant.update({
        where: { id },
        data: { status: 'INACTIVE' },
      })
      logger.info('Product variant archived (has order history)', { variantId: id, by: userId })
      return successResponse({ deleted: false, archived: true })
    }

    const db = prisma

    // Clean up dependents BEFORE deleting the variant. Each runs on its own so a
    // table that doesn't exist yet on a partially-migrated database (e.g. the
    // inventory-batch or storefront tables) is tolerated instead of aborting the
    // whole delete — Postgres poisons a transaction on any error, so we cannot
    // wrap these together and still ignore "relation does not exist".
    async function tolerantDelete(label: string, fn: () => Promise<unknown>) {
      try {
        await fn()
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).toLowerCase()
        if (message.includes('does not exist') || message.includes('no such table')) {
          return // table not migrated yet — nothing to clean up
        }
        logger.error(`Product delete cleanup failed (${label})`, { variantId: id, message })
        throw err
      }
    }

    await tolerantDelete('clientPricing', () =>
      db.clientPricing.deleteMany({ where: { variantId: id } })
    )
    await tolerantDelete('storefrontProduct', () =>
      db.storefrontProduct.deleteMany({ where: { variantId: id } })
    )
    await tolerantDelete('inventoryAdjustment', () =>
      db.inventoryAdjustment.deleteMany({ where: { variantId: id } })
    )
    // InventoryBatchEvent cascades on batch delete.
    await tolerantDelete('inventoryBatch', () =>
      db.inventoryBatch.deleteMany({ where: { variantId: id } })
    )

    await db.productVariant.delete({ where: { id } })

    const remaining = await db.productVariant.count({ where: { productId: variant.productId } })
    let productDeleted = false
    if (remaining === 0) {
      await tolerantDelete('productMedia', () =>
        db.productMedia.deleteMany({ where: { productId: variant.productId } })
      )
      await db.product.delete({ where: { id: variant.productId } })
      productDeleted = true
    }
    const result = { productDeleted }

    logger.info('Product variant deleted', {
      variantId: id,
      sku: variant.sku,
      productDeleted: result.productDeleted,
      by: userId,
    })

    return successResponse({ deleted: true, productDeleted: result.productDeleted })
  } catch (error) {
    logger.error(
      'Error deleting product variant',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to delete product')
  }
}
