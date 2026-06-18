import { getPricing } from '@/lib/pricing'
import type { PriceSheet } from '@/lib/pricing'
import PricingClient from './PricingClient'

// Pricing is per-request data (DB/Sheets); render dynamically and seed the
// client island server-side so there's no first-paint skeleton / round trip.
export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const { prices } = await getPricing()
  const initialPrices: PriceSheet[] = prices.map((p) => ({
    SKU: p.sku,
    Product: p.productName,
    Dose: p.dose,
    Cost: p.unitCost,
    SRP: p.srp,
    Notes: p.inventoryOnHand > 0 ? 'In Stock' : '',
  }))

  return <PricingClient initialPrices={initialPrices} />
}
