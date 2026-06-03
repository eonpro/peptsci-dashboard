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

    const variants = await prisma.productVariant.findMany({
      where: { status: 'ACTIVE' },
      include: { product: { select: { name: true, category: true } } },
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
