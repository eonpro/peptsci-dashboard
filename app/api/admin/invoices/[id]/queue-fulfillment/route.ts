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
import { fulfillPlatformInvoiceProducts } from '@/lib/invoicing/fulfill-products'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/invoices/[id]/queue-fulfillment
 *
 * Mint (or re-run) the fulfillable Order for a PAID product-only invoice.
 * Used to repair invoices created before variantId was persisted (e.g. INV-00001).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const result = await fulfillPlatformInvoiceProducts(id)

    if (result.status === 'skipped') {
      const messages: Record<string, string> = {
        not_found: 'Invoice not found',
        not_paid: 'Invoice must be PAID before queuing fulfillment',
        no_catalog_lines: 'No catalog product lines could be matched to inventory',
        no_order_actor: 'No admin user available to attribute the order',
        db_unavailable: 'Database not connected',
      }
      const msg = messages[result.reason] ?? `Skipped: ${result.reason}`
      const status = result.reason === 'not_found' ? 404 : 400
      return errorResponse(msg, status, result.reason.toUpperCase())
    }

    return successResponse({ result })
  } catch (error) {
    logger.error(
      '[admin/invoices/queue-fulfillment] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to queue fulfillment')
  }
}
