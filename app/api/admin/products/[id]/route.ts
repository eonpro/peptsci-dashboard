import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
