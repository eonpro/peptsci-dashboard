import { getPricing } from '@/lib/pricing'
import type { PriceSheet } from '@/lib/pricing'
import { getProductCatalog } from '@/lib/catalog'
import { getSkusWithPublishedCoa } from '@/lib/coa'
import { groupProductsByParent, type ShopProduct } from '@/lib/types/shop'
import PricingClient from './PricingClient'

// Pricing is per-request data (DB/Sheets); render dynamically and seed the
// client island server-side so there's no first-paint skeleton / round trip.
export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const [{ prices }, { products: catalog }] = await Promise.all([
    getPricing(),
    getProductCatalog(),
  ])

  const initialPrices: PriceSheet[] = prices.map((p) => ({
    SKU: p.sku,
    Product: p.productName,
    Dose: p.dose,
    Cost: p.unitCost,
    SRP: p.srp,
    Notes: p.inventoryOnHand > 0 ? 'In Stock' : '',
    Id: p.id,
  }))

  // Same grouped catalog cards as /shop — COA flags for "View COA" on cards.
  const coaSkus = await getSkusWithPublishedCoa(catalog.map((p) => p.sku).filter(Boolean))
  const productsWithCoa = catalog.map((p) => ({ ...p, hasCoa: coaSkus.has(p.sku) }))
  const initialProducts: ShopProduct[] = groupProductsByParent(productsWithCoa)

  return <PricingClient initialPrices={initialPrices} initialProducts={initialProducts} />
}
