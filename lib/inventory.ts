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
  const [variants, batchCounts, soonestBuds] = await Promise.all([
    prisma.productVariant.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        sku: true,
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
  ])
  const countByVariant = new Map(batchCounts.map((b) => [b.variantId, b._count._all]))
  const budByVariant = new Map(soonestBuds.map((b) => [b.variantId, b._min.bud]))
  return variants.map((v) => ({
    variantId: v.id,
    sku: v.sku,
    productName: v.product.name,
    dose: v.dose,
    onHand: v.inventoryOnHand,
    reserved: v.inventoryReserved,
    reorderLevel: v.reorderLevel,
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
