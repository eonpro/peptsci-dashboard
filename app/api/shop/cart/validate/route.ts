import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import { resolveEffectiveUnitPrice } from '@/lib/access'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  skus: z.array(z.string().min(1)).min(1).max(100),
})

/**
 * POST /api/shop/cart/validate — refresh a localStorage cart against current
 * catalog state: the caller's effective unit price (custom pricing or SRP) and
 * availability per SKU. Display-only helper; checkout still prices
 * server-side, this just keeps the cart honest between sessions.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    const clientId = actor?.clientId ?? null

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('skus[] is required', 400, 'VALIDATION_ERROR')

    const variants = await prisma.productVariant.findMany({
      where: { sku: { in: parsed.data.skus }, status: 'ACTIVE' },
      select: {
        sku: true,
        srp: true,
        unitCost: true,
        inventoryOnHand: true,
        inventoryReserved: true,
        clientPricing: clientId
          ? {
              where: {
                clientId,
                isActive: true,
                AND: [
                  { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
                  { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
                ],
              },
              select: { customPrice: true },
            }
          : undefined,
      },
    })

    const bySku = new Map(variants.map((v) => [v.sku, v]))
    const lines = parsed.data.skus.map((sku) => {
      const v = bySku.get(sku)
      if (!v) return { sku, available: false as const, unitPrice: null }
      const custom = Array.isArray(v.clientPricing) ? v.clientPricing[0] : undefined
      const { price } = resolveEffectiveUnitPrice({
        srp: Number(v.srp),
        customPrice: custom ? Number(custom.customPrice) : null,
        unitCost: Number(v.unitCost),
        paysAtCost: actor?.paysAtCost ?? false,
      })
      return {
        sku,
        available: true as const,
        unitPrice: price > 0 ? Math.round(price * 100) / 100 : null,
        sellable: Math.max(0, v.inventoryOnHand - v.inventoryReserved),
      }
    })

    return successResponse({ lines })
  } catch (error) {
    logger.error(
      '[shop/cart/validate] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to validate cart')
  }
}
