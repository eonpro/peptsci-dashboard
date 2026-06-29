import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { buildPackingSlipData } from '@/lib/fulfillment/service'
import { generatePackingSlipPdf } from '@/lib/fulfillment/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/admin/orders/[id]/packing-slip/pdf — customer-facing packing slip. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const slip = await buildPackingSlipData(id)
    const pdf = await generatePackingSlipPdf(slip)

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="peptsci-order-${slip.orderNumber}-packing-slip.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Order not found') {
      return errorResponse('Order not found', 404, 'NOT_FOUND')
    }
    logger.error(
      '[admin/orders/packing-slip/pdf] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to generate packing slip PDF')
  }
}
