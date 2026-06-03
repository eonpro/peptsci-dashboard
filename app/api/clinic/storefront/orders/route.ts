import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { getUserMetadata } from '@/lib/roles'
import { getRetailOrders } from '@/lib/storefront'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const meta = await getUserMetadata()
    if (!meta.clientId) return errorResponse('No client association', 403, 'NO_CLIENT')

    if (!prisma) return successResponse([])

    const sf = await prisma.storefront.findUnique({
      where: { clientId: meta.clientId },
      select: { id: true },
    })
    if (!sf) return errorResponse('No storefront', 404, 'NOT_FOUND')

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    const orders = await getRetailOrders(sf.id, { limit, offset })

    const summary = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      customerEmail: o.endCustomer?.email ?? o.guestEmail,
      customerName: o.endCustomer
        ? `${o.endCustomer.firstName ?? ''} ${o.endCustomer.lastName ?? ''}`.trim()
        : null,
      itemCount: o.items.length,
      subtotal: Number(o.subtotal),
      total: Number(o.total),
      createdAt: o.createdAt.toISOString(),
    }))

    return successResponse(summary)
  } catch (error) {
    logger.error('Error fetching clinic retail orders', {}, error as Error)
    return errorResponse('Failed to fetch orders')
  }
}
