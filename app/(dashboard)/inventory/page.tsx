import { listBatches } from '@/lib/inventory-batches'
import { listCatalogStock } from '@/lib/inventory'
import InventoryClient, { type BatchRow } from './InventoryClient'

// Inventory is per-request data; render dynamically and seed the client island
// server-side so there's no first-paint skeleton / client round trip.
export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const [batches, catalog] = await Promise.all([listBatches({ status: 'ALL' }), listCatalogStock()])
  const initialBatches: BatchRow[] = batches.map((b) => ({
    id: b.id,
    batchNumber: b.batchNumber,
    productName: b.productName,
    dose: b.dose,
    vialSize: b.vialSize,
    purity: b.purity,
    bud: b.bud.toISOString(),
    receivedOn: b.receivedOn.toISOString(),
    qtyReceived: b.qtyReceived,
    qtyDamaged: b.qtyDamaged,
    qtyOnHand: b.qtyOnHand,
    status: b.status,
    yearColor: b.yearColor,
    variant: b.variant ? { sku: b.variant.sku } : undefined,
  }))

  return <InventoryClient initialBatches={initialBatches} initialCatalog={catalog} />
}
