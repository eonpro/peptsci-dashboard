/**
 * Inventory data, sourced from Postgres (ProductVariant). Replaces the former
 * Google Sheets "Inventory" tab. The `Inventory` shape is preserved so the
 * existing consumers (search, P&L valuation, inventory adjustments) are
 * unchanged.
 */

import { prisma } from './prisma'
import { logger } from './logger'

export interface Inventory {
  SKU: string
  MedicationName: string
  Dose: string
  SRP: number
  Cost: number
  InventoryOrdered: number
  InventoryAvailable: number
  OriginalInventoryAvailable?: number
  UnitsSold?: number
  CalculatedInventoryAvailable?: number
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
      InventoryAvailable: v.inventoryOnHand,
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
