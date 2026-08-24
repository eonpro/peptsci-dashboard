import { NextRequest } from 'next/server'
import {
  requireAnyPermission,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getOrderCoaPack } from '@/lib/coa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/orders/[id]/coas — published certificates to print into the box.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, allowed } = await requireAnyPermission(
      'fulfillment:read',
      'fulfillment:write'
    )
    if (!isAuthenticated) return unauthorizedResponse()
    if (!allowed) return forbiddenResponse('Fulfillment access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const pack = await getOrderCoaPack(id, (coaId) => `/api/admin/products/_/coa/${coaId}/file`)
    if (!pack) return errorResponse('Order not found', 404, 'NOT_FOUND')

    return successResponse({
      pageCount: pack.pack.pageCount,
      warnings: pack.pack.warnings,
      lines: pack.lines.map((line) => ({
        variantId: line.variantId,
        sku: line.sku,
        productName: line.productName,
        dose: line.dose,
        quantity: line.quantity,
        missingComponents: line.missingComponents,
        certificates: line.coas.map((c) => ({
          id: c.id,
          compoundName: c.compoundName,
          doseLabel: c.doseLabel,
          purityPercent: c.purityPercent,
          assayMeasuredMg: c.assayMeasuredMg,
          assayLabelClaimMg: c.assayLabelClaimMg,
        })),
      })),
    })
  } catch (error) {
    logger.error(
      '[admin/orders/coas] GET error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load order certificates')
  }
}
