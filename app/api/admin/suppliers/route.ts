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
 * GET /api/admin/suppliers
 *
 * List suppliers with their price-list items (per-vial cost, list price,
 * vials per box). Consumed by the PO generator's supplier picker. Admin only.
 */
export async function GET(_request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) return successResponse({ suppliers: [] })

    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        contactName: true,
        contactEmail: true,
        website: true,
        notes: true,
        priceItems: {
          orderBy: [{ productName: 'asc' }, { dose: 'asc' }],
          select: {
            id: true,
            supplierSku: true,
            productName: true,
            dose: true,
            vialsPerBox: true,
            unitCost: true,
            listPrice: true,
          },
        },
      },
    })

    return successResponse({
      suppliers: suppliers.map((s) => ({
        ...s,
        priceItems: s.priceItems.map((i) => ({
          ...i,
          unitCost: Number(i.unitCost),
          listPrice: i.listPrice !== null ? Number(i.listPrice) : null,
        })),
      })),
    })
  } catch (error) {
    logger.error(
      'Error listing suppliers',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to list suppliers')
  }
}
