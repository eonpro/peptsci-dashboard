/**
 * Inventory data, sourced from Postgres (ProductVariant). Replaces the former
 * Google Sheets "Inventory" tab. The `Inventory` shape is preserved so the
 * existing consumers (search, P&L valuation, inventory adjustments) are
 * unchanged.
 */

import { prisma } from './prisma'
import { logger } from './logger'
import { availableQty } from './inventory/reservations-core'

export interface Inventory {
  SKU: string
  MedicationName: string
  Dose: string
  SRP: number
  Cost: number
  InventoryOrdered: number
  InventoryAvailable: number
  /** Physical units on hand (before subtracting reservations). */
  OnHand?: number
  /** Units committed to open orders. */
  Reserved?: number
  OriginalInventoryAvailable?: number
  UnitsSold?: number
  CalculatedInventoryAvailable?: number
}

export interface CatalogStockRow {
  variantId: string
  sku: string | null
  productName: string
  dose: string | null
  onHand: number
  reserved: number
  reorderLevel: number
  /**
   * Units on order via open purchase orders (placed but not yet received as
   * batches). Informational only — never counted as available for sale.
   */
  incoming: number
  /** RECEIVED (active) batches attached to this variant. */
  batches: number
  /** Soonest BUD among RECEIVED batches that still hold stock (ISO), else null. */
  soonestBud: string | null
}

/**
 * Every ACTIVE catalog variant with its stock counters — the Inventory page's
 * "By Product" view. Products appear here at 0 on hand as soon as they exist
 * in the catalog, before any batch is received. Batch aggregates (count +
 * soonest BUD) are computed server-side so the view doesn't need the full
 * batch list on the client.
 */
export async function listCatalogStock(): Promise<CatalogStockRow[]> {
  if (!prisma) return []
  const [variants, batchCounts, soonestBuds, openPoLines] = await Promise.all([
    prisma.productVariant.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        sku: true,
        supplierSku: true,
        dose: true,
        inventoryOnHand: true,
        inventoryReserved: true,
        reorderLevel: true,
        product: { select: { name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
    }),
    prisma.inventoryBatch.groupBy({
      by: ['variantId'],
      where: { status: 'RECEIVED' },
      _count: { _all: true },
    }),
    prisma.inventoryBatch.groupBy({
      by: ['variantId'],
      where: { status: 'RECEIVED', qtyOnHand: { gt: 0 } },
      _min: { bud: true },
    }),
    // Purchase-order lines still awaiting receipt ("incoming" stock).
    prisma.distributorOrderLine.findMany({
      where: { order: { status: { not: 'delivered' } } },
      select: { sku: true, productName: true, dose: true, quantity: true, receivedQty: true },
    }),
  ])
  const countByVariant = new Map(batchCounts.map((b) => [b.variantId, b._count._all]))
  const budByVariant = new Map(soonestBuds.map((b) => [b.variantId, b._min.bud]))

  // Match open PO lines to variants: by our SKU or the supplier's Cat.No when
  // the line carries one, else by product name + dose (case-insensitive).
  const variantBySku = new Map<string, string>()
  const variantByNameDose = new Map<string, string>()
  for (const v of variants) {
    if (v.sku) variantBySku.set(v.sku.toLowerCase(), v.id)
    if (v.supplierSku) variantBySku.set(v.supplierSku.toLowerCase(), v.id)
    variantByNameDose.set(`${v.product.name}::${v.dose ?? ''}`.toLowerCase(), v.id)
  }
  const incomingByVariant = new Map<string, number>()
  for (const line of openPoLines) {
    const pending = Math.max(0, line.quantity - line.receivedQty)
    if (pending === 0) continue
    const variantId =
      (line.sku ? variantBySku.get(line.sku.toLowerCase()) : undefined) ??
      variantByNameDose.get(`${line.productName}::${line.dose}`.toLowerCase())
    if (!variantId) continue
    incomingByVariant.set(variantId, (incomingByVariant.get(variantId) ?? 0) + pending)
  }

  return variants.map((v) => ({
    variantId: v.id,
    sku: v.sku,
    productName: v.product.name,
    dose: v.dose,
    onHand: v.inventoryOnHand,
    reserved: v.inventoryReserved,
    reorderLevel: v.reorderLevel,
    incoming: incomingByVariant.get(v.id) ?? 0,
    batches: countByVariant.get(v.id) ?? 0,
    soonestBud: budByVariant.get(v.id)?.toISOString() ?? null,
  }))
}

/**
 * Return current inventory from active product variants. On-hand and reorder
 * levels come straight from ProductVariant; "ordered" has no separate column
 * in the catalog model, so it mirrors on-hand.
 */
export async function getInventory(): Promise<Inventory[]> {
  if (!prisma) return []

  try {
    const variants = await prisma.productVariant.findMany({
      where: { status: 'ACTIVE' },
      select: {
        sku: true,
        dose: true,
        srp: true,
        unitCost: true,
        inventoryOnHand: true,
        inventoryReserved: true,
        product: { select: { name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
    })

    const inventory: Inventory[] = variants.map((v) => ({
      SKU: v.sku || '',
      MedicationName: v.product.name,
      Dose: v.dose || '',
      SRP: Number(v.srp),
      Cost: Number(v.unitCost),
      InventoryOrdered: v.inventoryOnHand,
      // "Available" now nets out units reserved for open orders.
      InventoryAvailable: availableQty(v.inventoryOnHand, v.inventoryReserved),
      OnHand: v.inventoryOnHand,
      Reserved: v.inventoryReserved,
    }))

    logger.info('Loaded inventory from Postgres', { count: inventory.length })
    return inventory
  } catch (error) {
    logger.error(
      'Error fetching inventory',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return []
  }
}
