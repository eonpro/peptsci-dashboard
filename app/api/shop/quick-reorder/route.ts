import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import { resolveEffectiveUnitPrice } from '@/lib/access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shop/quick-reorder — the client's most-ordered catalog items with
 * CURRENT effective pricing and availability, for the one-tap "Buy it again"
 * strip on the catalog. Empty list for clients with no order history.
 */
export async function GET() {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    if (!actor) return successResponse({ items: [] })

    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          clientId: actor.clientId,
          status: { notIn: ['DRAFT', 'CANCELLED', 'REJECTED'] },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        quantity: true,
        createdAt: true,
        variant: {
          select: {
            id: true,
            sku: true,
            dose: true,
            srp: true,
            unitCost: true,
            status: true,
            inventoryOnHand: true,
            inventoryReserved: true,
            product: { select: { name: true } },
            clientPricing: {
              where: {
                clientId: actor.clientId,
                isActive: true,
                AND: [
                  { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
                  { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
                ],
              },
              select: { customPrice: true },
            },
          },
        },
      },
    })

    // Aggregate by variant: order frequency + recency drive the ranking.
    const byVariant = new Map<
      string,
      { item: (typeof orderItems)[number]['variant']; times: number; last: Date }
    >()
    for (const row of orderItems) {
      const v = row.variant
      if (!v || v.status !== 'ACTIVE' || !v.sku) continue
      const existing = byVariant.get(v.id)
      if (existing) {
        existing.times += 1
        if (row.createdAt > existing.last) existing.last = row.createdAt
      } else {
        byVariant.set(v.id, { item: v, times: 1, last: row.createdAt })
      }
    }

    const items = Array.from(byVariant.values())
      .sort((a, b) => b.times - a.times || b.last.getTime() - a.last.getTime())
      .slice(0, 8)
      .map(({ item, times, last }) => {
        const custom = item.clientPricing[0]
        const { price, isCustom } = resolveEffectiveUnitPrice({
          srp: Number(item.srp),
          customPrice: custom ? Number(custom.customPrice) : null,
          unitCost: Number(item.unitCost),
          paysAtCost: actor.paysAtCost,
        })
        const sellable = Math.max(0, item.inventoryOnHand - item.inventoryReserved)
        return {
          sku: item.sku,
          name: item.product.name,
          dose: item.dose,
          unitPrice: price > 0 ? Math.round(price * 100) / 100 : null,
          isCustomPrice: isCustom,
          inStock: sellable > 0,
          sellable,
          timesOrdered: times,
          lastOrderedAt: last.toISOString(),
        }
      })
      .filter((i) => i.unitPrice != null)

    return successResponse({ items })
  } catch (error) {
    logger.error(
      '[shop/quick-reorder] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load reorder items')
  }
}
