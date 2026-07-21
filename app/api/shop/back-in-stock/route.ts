import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopActor } from '@/lib/shop-actor'
import {
  subscribeBackInStock,
  unsubscribeBackInStock,
  armedVariantIds,
} from '@/lib/back-in-stock'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  sku: z.string().trim().min(1).max(120),
})

async function variantIdForSku(sku: string): Promise<string | null> {
  if (!prisma) return null
  // ShopProduct ids are SKU-first with a variant-id fallback (lib/catalog.ts).
  const variant = await prisma.productVariant.findFirst({
    where: { OR: [{ sku }, { id: sku }] },
    select: { id: true },
  })
  return variant?.id ?? null
}

/** GET /api/shop/back-in-stock — SKUs the practice has armed alerts for. */
export async function GET(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    if (!actor) return errorResponse('No practice linked to this account', 403, 'NO_CLIENT')

    const ids = await armedVariantIds(actor.clientId)
    if (ids.size === 0) return successResponse({ skus: [] })
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, sku: true },
    })
    return successResponse({ skus: variants.map((v) => v.sku ?? v.id) })
  } catch (error) {
    logger.error('[shop/back-in-stock] list error', {}, error as Error)
    return errorResponse('Failed to load alerts')
  }
}

/** POST /api/shop/back-in-stock — arm (or re-arm) an alert for a SKU. */
export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { limited } = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
    if (limited) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED')

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('SKU is required', 400, 'VALIDATION_ERROR')

    const actor = await resolveShopActor(userId)
    if (!actor) return errorResponse('No practice linked to this account', 403, 'NO_CLIENT')

    const variantId = await variantIdForSku(parsed.data.sku)
    if (!variantId) return errorResponse('Product not found', 404, 'NOT_FOUND')

    await subscribeBackInStock(actor.clientId, variantId, userId)
    return successResponse({ subscribed: true }, 201)
  } catch (error) {
    logger.error('[shop/back-in-stock] subscribe error', {}, error as Error)
    return errorResponse('Failed to save alert')
  }
}

/** DELETE /api/shop/back-in-stock?sku=… — disarm an alert. */
export async function DELETE(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const sku = new URL(request.url).searchParams.get('sku')?.trim()
    if (!sku) return errorResponse('SKU is required', 400, 'VALIDATION_ERROR')

    const actor = await resolveShopActor(userId)
    if (!actor) return errorResponse('No practice linked to this account', 403, 'NO_CLIENT')

    const variantId = await variantIdForSku(sku)
    if (variantId) await unsubscribeBackInStock(actor.clientId, variantId)
    return successResponse({ subscribed: false })
  } catch (error) {
    logger.error('[shop/back-in-stock] unsubscribe error', {}, error as Error)
    return errorResponse('Failed to remove alert')
  }
}
