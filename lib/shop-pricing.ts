/**
 * Overlay client-specific pricing onto shop catalog products.
 *
 * Catalog products (Airtable/Sheets) carry an SRP/list price in `displayPrice`.
 * For an authenticated client with custom pricing, we override `displayPrice`
 * with their negotiated price (preserving the original in `standardPrice`).
 * Because cart/checkout/orders read `displayPrice`, the client-specific price
 * flows through the entire order lifecycle automatically.
 */

import { getClientShopPricingContext } from './pricing'
import { resolveEffectiveUnitPrice } from './access'
import type { ShopProduct } from './types/shop'

export async function applyClientPricing(
  products: ShopProduct[],
  clientId: string | null | undefined
): Promise<ShopProduct[]> {
  const ctx = clientId ? await getClientShopPricingContext(clientId) : null

  if (!ctx || (!ctx.paysAtCost && ctx.customBySku.size === 0)) {
    return products.map((p) => ({ ...p, standardPrice: p.displayPrice, isCustomPrice: false }))
  }

  return products.map((p) => {
    const custom = ctx.customBySku.get(p.sku)
    const { price, isCustom } = resolveEffectiveUnitPrice({
      srp: p.displayPrice,
      customPrice: custom ?? null,
      unitCost: ctx.costBySku.get(p.sku) ?? null,
      paysAtCost: ctx.paysAtCost,
    })
    return { ...p, standardPrice: p.displayPrice, displayPrice: price, isCustomPrice: isCustom }
  })
}
