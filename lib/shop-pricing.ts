/**
 * Overlay client-specific pricing onto shop catalog products.
 *
 * Catalog products (Airtable/Sheets) carry an SRP/list price in `displayPrice`.
 * For an authenticated client with custom pricing, we override `displayPrice`
 * with their negotiated price (preserving the original in `standardPrice`).
 * Because cart/checkout/orders read `displayPrice`, the client-specific price
 * flows through the entire order lifecycle automatically.
 */

import { getClientPriceMapBySku } from './pricing'
import { resolveEffectiveUnitPrice } from './access'
import type { ShopProduct } from './types/shop'

export async function applyClientPricing(
  products: ShopProduct[],
  clientId: string | null | undefined
): Promise<ShopProduct[]> {
  const priceMap = clientId ? await getClientPriceMapBySku(clientId) : null

  if (!priceMap || priceMap.size === 0) {
    return products.map((p) => ({ ...p, standardPrice: p.displayPrice, isCustomPrice: false }))
  }

  return products.map((p) => {
    const custom = priceMap.get(p.sku)
    const { price, isCustom } = resolveEffectiveUnitPrice({
      srp: p.displayPrice,
      customPrice: custom ?? null,
    })
    return { ...p, standardPrice: p.displayPrice, displayPrice: price, isCustomPrice: isCustom }
  })
}
