import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { resolveEffectiveUnitPrice } from '@/lib/access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shop/orders/[id]/reorder — cart-ready lines for "Buy again".
 * Items are repriced at the client's CURRENT effective price (never the
 * historical order price) and discontinued SKUs are reported, not silently
 * dropped. The server reprices again at checkout regardless.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const order = await prisma.order.findFirst({
      where: { id, clientId },
      select: {
        items: {
          select: {
            quantity: true,
            variant: {
              select: {
                sku: true,
                dose: true,
                status: true,
                srp: true,
                product: { select: { name: true } },
                clientPricing: {
                  where: {
                    clientId,
                    isActive: true,
                    OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
                  },
                  select: { customPrice: true },
                },
              },
            },
          },
        },
      },
    })
    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')

    const items: Array<{
      sku: string
      name: string
      dose: string | null
      quantity: number
      price: number
    }> = []
    const unavailable: string[] = []

    for (const it of order.items) {
      const v = it.variant
      if (!v.sku || v.status !== 'ACTIVE') {
        unavailable.push(v.product.name + (v.dose ? ` ${v.dose}` : ''))
        continue
      }
      const { price } = resolveEffectiveUnitPrice({
        srp: Number(v.srp),
        customPrice: v.clientPricing[0] ? Number(v.clientPricing[0].customPrice) : null,
      })
      items.push({
        sku: v.sku,
        name: v.product.name,
        dose: v.dose,
        quantity: it.quantity,
        price,
      })
    }

    return successResponse({ items, unavailable })
  } catch (error) {
    logger.error('[shop/orders/:id/reorder] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load reorder items')
  }
}
