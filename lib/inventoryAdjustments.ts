import type { Inventory, Sale } from './sheets'

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '')

const baseNormalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()

interface InventoryKeyMap {
  index: number
  keys: Set<string>
}

const buildInventoryKeyMap = (inventory: Inventory[]): InventoryKeyMap[] => {
  return inventory.map((item, index) => {
    const keys = new Set<string>()

    const baseName = baseNormalize(item.MedicationName)
    const withDose = baseNormalize(`${item.MedicationName} ${item.Dose}`)
    const sku = item.SKU ? baseNormalize(item.SKU) : null

    const variations = [
      baseName,
      withDose,
      normalize(baseName),
      normalize(withDose),
      item.Dose ? baseNormalize(item.Dose) : null,
      item.Dose ? normalize(item.Dose) : null,
      sku,
      sku ? normalize(sku) : null,
    ].filter(Boolean) as string[]

    variations.forEach((variation) => {
      keys.add(variation)
      keys.add(normalize(variation))
    })

    return { index, keys }
  })
}

const buildSaleKeys = (product: string): Set<string> => {
  const keys = new Set<string>()
  const normalized = baseNormalize(product)
  const normalizedCompact = normalize(product)

  keys.add(normalized)
  keys.add(normalizedCompact)

  // Split on common separators to capture component matches
  const parts = normalized
    .split(/[/,&+]/)
    .map((part) => part.trim())
    .filter(Boolean)

  parts.forEach((part) => {
    keys.add(part)
    keys.add(normalize(part))
  })

  return keys
}

/**
 * Reduces inventory availability based on sales data.
 *
 * For each sale, matches the product to inventory using flexible
 * normalization (medication name, dose, SKU). The `InventoryAvailable`
 * field is reduced by the number of vials sold.
 *
 * Returned inventory includes:
 * - `OriginalInventoryAvailable`: The starting on-hand count
 * - `UnitsSold`: Total vials sold for that SKU
 * - `InventoryAvailable`: Remaining units (original - sold, min 0)
 *
 * @param inventory - Current inventory records
 * @param sales - Sales with product names and vial counts
 * @returns Adjusted inventory with depletion applied
 */
export const adjustInventoryWithSales = (inventory: Inventory[], sales: Sale[]): Inventory[] => {
  if (inventory.length === 0 || sales.length === 0) {
    return inventory.map((item) => ({
      ...item,
      OriginalInventoryAvailable: item.InventoryAvailable,
      UnitsSold: 0,
    }))
  }

  const adjusted = inventory.map((item) => ({
    ...item,
    OriginalInventoryAvailable: item.InventoryAvailable,
    UnitsSold: 0,
  }))

  const inventoryMap = buildInventoryKeyMap(adjusted)

  sales.forEach((sale) => {
    if (!sale.Product || sale.Vials <= 0) return

    const saleKeys = buildSaleKeys(sale.Product)
    const match = inventoryMap.find(({ keys }) => {
      for (const saleKey of saleKeys) {
        if (keys.has(saleKey)) return true
        if (keys.has(normalize(saleKey))) return true
        if (saleKey.length > 0) {
          for (const inventoryKey of keys) {
            if (
              saleKey === inventoryKey ||
              saleKey.includes(inventoryKey) ||
              inventoryKey.includes(saleKey)
            ) {
              return true
            }
          }
        }
      }
      return false
    })

    if (match) {
      const item = adjusted[match.index]
      item.UnitsSold = (item.UnitsSold ?? 0) + sale.Vials
    }
  })

  return adjusted.map((item) => {
    const original = item.OriginalInventoryAvailable ?? item.InventoryAvailable
    const sold = item.UnitsSold ?? 0
    const remaining = Math.max(0, original - sold)

    return {
      ...item,
      InventoryAvailable: remaining,
      CalculatedInventoryAvailable: remaining,
    }
  })
}
