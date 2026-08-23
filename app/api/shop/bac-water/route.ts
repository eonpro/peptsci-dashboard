import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getProductCatalog } from '@/lib/catalog'
import { applyClientPricing } from '@/lib/shop-pricing'
import { resolveShopActor } from '@/lib/shop-actor'
import {
  bacWaterVolumeMl,
  isBacteriostaticWaterProduct,
  usesHospiraBacPhoto,
  usesPeptSciBacLabel,
} from '@/lib/shop/bac-water'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shop/bac-water — BAC water sizes with the viewing clinic's price,
 * used by the checkout reconstitution upsell.
 */
export async function GET(_request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const actor = await resolveShopActor(userId)
    const { products } = await getProductCatalog()
    const priced = await applyClientPricing(products, actor?.clientId ?? null)
    const options = priced
      .filter((p) => isBacteriostaticWaterProduct(p.name, p.sku) && p.displayPrice > 0)
      .map((p) => ({
        sku: p.sku,
        name: p.name,
        dose: p.dose,
        price: p.displayPrice,
        inStock: p.inStock !== false,
        presentation: usesPeptSciBacLabel(p.name, p.dose, p.sku)
          ? ('peptsci-label' as const)
          : usesHospiraBacPhoto(p.name, p.dose, p.sku)
            ? ('hospira' as const)
            : ('peptsci-label' as const),
      }))
      .sort((a, b) => (bacWaterVolumeMl(a.name, a.dose, a.sku) ?? 99) - (bacWaterVolumeMl(b.name, b.dose, b.sku) ?? 99))

    return successResponse({ options })
  } catch (error) {
    logger.error(
      '[shop/bac-water] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load bacteriostatic water options')
  }
}
