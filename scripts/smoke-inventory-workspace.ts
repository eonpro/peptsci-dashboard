/**
 * Read-only smoke test for the Inventory workspace data layer (run against
 * the local dev DB): paged batches (incl. derived scopes), catalog rollup,
 * summary KPIs/series, paged adjustments, and enriched reservations.
 *
 * Usage: npx tsx --env-file=.env.local scripts/smoke-inventory-workspace.ts
 */
import { listBatchesPaged } from '../lib/inventory-batches'
import { listCatalogStock } from '../lib/inventory'
import { getInventorySummary } from '../lib/inventory-summary'
import { listInventoryAdjustmentsPaged } from '../lib/inventory-log'
import { listActiveReservationsPaged } from '../lib/inventory/reservations'

async function main() {
  const paged = await listBatchesPaged({ status: 'ACTIVE', page: 1, pageSize: 5, sort: 'bud', dir: 'asc' })
  console.log('batches ACTIVE total:', paged.total, '| page rows:', paged.batches.length)
  console.log('  soonest-BUD page:', paged.batches.map((b) => `${b.batchNumber} (${b.bud.toISOString().slice(0, 10)})`))

  const expiring = await listBatchesPaged({ status: 'EXPIRING', page: 1, pageSize: 5 })
  const expired = await listBatchesPaged({ status: 'EXPIRED', page: 1, pageSize: 5 })
  console.log('EXPIRING total:', expiring.total, '| EXPIRED total:', expired.total)

  const search = await listBatchesPaged({ status: 'ALL', search: 'ZZZ-NO-MATCH', page: 1, pageSize: 5 })
  console.log('search no-match total (expect 0):', search.total)

  const catalog = await listCatalogStock()
  console.log('catalog rows:', catalog.length, '| sample:', JSON.stringify(catalog[0] ?? null))

  const summary = await getInventorySummary(30)
  console.log('kpis:', JSON.stringify(summary.kpis))
  console.log('movement days (expect 30):', summary.movement.length)
  console.log('reasonTotals:', JSON.stringify(summary.reasonTotals))
  console.log('topProducts:', summary.topProducts.length, '| expiringBatches:', summary.expiringBatches.length)

  const adj = await listInventoryAdjustmentsPaged({ page: 1, pageSize: 5 })
  console.log('adjustments total:', adj.total, '| page rows:', adj.adjustments.length)

  const adjReceipts = await listInventoryAdjustmentsPaged({ page: 1, pageSize: 5, reason: 'RECEIPT' })
  console.log('adjustments RECEIPT total:', adjReceipts.total)

  const res = await listActiveReservationsPaged({ page: 1, pageSize: 5 })
  console.log('reservations total:', res.total, '| units:', res.totalUnits)
  console.log('  sample:', JSON.stringify(res.reservations[0] ?? null))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
