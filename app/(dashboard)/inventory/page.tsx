import { listBatchesPaged } from '@/lib/inventory-batches'
import { listCatalogStock } from '@/lib/inventory'
import { getInventorySummary } from '@/lib/inventory-summary'
import { stockEnforcementEnabled } from '@/lib/stock-enforcement'
import InventoryClient, { type BatchRow } from './InventoryClient'

// Inventory is per-request data; render dynamically and seed the client island
// server-side so there's no first-paint skeleton / client round trip.
export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const [paged, catalog, summary] = await Promise.all([
    listBatchesPaged({ status: 'ACTIVE', page: 1, pageSize: 25, sort: 'createdAt', dir: 'desc' }),
    listCatalogStock(),
    getInventorySummary(30),
  ])
  const initialBatches: BatchRow[] = paged.batches.map((b) => ({
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

  return (
    <InventoryClient
      initialBatches={{
        batches: initialBatches,
        total: paged.total,
        page: paged.page,
        pageSize: paged.pageSize,
      }}
      initialCatalog={catalog}
      initialSummary={summary}
      enforcementEnabled={stockEnforcementEnabled()}
    />
  )
}
