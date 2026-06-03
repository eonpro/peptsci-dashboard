import type { Sale, Inventory, PriceSheet } from './sheets'

export interface SearchResult {
  type: 'customer' | 'order' | 'product' | 'inventory'
  id: string
  title: string
  subtitle: string
  href: string
  metadata?: Record<string, string | number>
}

/**
 * Normalizes a string for search comparison.
 */
function normalize(str: string): string {
  return str.toLowerCase().trim()
}

/**
 * Checks if a string contains the search query.
 */
function matches(value: string | null | undefined, query: string): boolean {
  if (!value) return false
  return normalize(value).includes(normalize(query))
}

/**
 * Searches sales data for customers and orders.
 */
export function searchSales(sales: Sale[], query: string, limit = 10): SearchResult[] {
  const results: SearchResult[] = []
  const seenCustomers = new Set<string>()
  const seenOrders = new Set<string>()

  for (const sale of sales) {
    if (results.length >= limit * 2) break // Get enough for both types

    // Search customers
    const customerKey = sale.CustomerEmail?.toLowerCase() || sale.CustomerName?.toLowerCase()
    if (customerKey && !seenCustomers.has(customerKey)) {
      if (
        matches(sale.CustomerName, query) ||
        matches(sale.CustomerEmail, query) ||
        matches(sale.CustomerPhone, query)
      ) {
        seenCustomers.add(customerKey)
        results.push({
          type: 'customer',
          id: encodeURIComponent(sale.CustomerEmail || sale.CustomerName),
          title: sale.CustomerName || 'Unknown Customer',
          subtitle: sale.CustomerEmail || sale.CustomerPhone || '',
          href: `/customers/${encodeURIComponent(sale.CustomerEmail || sale.CustomerName)}`,
          metadata: {
            city: sale.City || '',
            state: sale.State || '',
          },
        })
      }
    }

    // Search orders
    if (sale.OrderID && !seenOrders.has(sale.OrderID)) {
      if (
        matches(sale.OrderID, query) ||
        matches(sale.TrackingNumber, query) ||
        matches(sale.Product, query)
      ) {
        seenOrders.add(sale.OrderID)
        results.push({
          type: 'order',
          id: sale.OrderID,
          title: `Order ${sale.OrderID}`,
          subtitle: `${sale.Product} - $${sale.PaidAmount.toFixed(2)}`,
          href: `/customers/${encodeURIComponent(sale.CustomerEmail || sale.CustomerName)}`,
          metadata: {
            date: sale.Date?.toISOString().split('T')[0] || '',
            amount: sale.PaidAmount,
          },
        })
      }
    }
  }

  // Sort: customers first, then orders
  results.sort((a, b) => {
    if (a.type === 'customer' && b.type !== 'customer') return -1
    if (a.type !== 'customer' && b.type === 'customer') return 1
    return 0
  })

  return results.slice(0, limit)
}

/**
 * Searches inventory data.
 */
export function searchInventory(inventory: Inventory[], query: string, limit = 10): SearchResult[] {
  const results: SearchResult[] = []

  for (const item of inventory) {
    if (results.length >= limit) break

    if (
      matches(item.MedicationName, query) ||
      matches(item.SKU, query) ||
      matches(item.Dose, query)
    ) {
      results.push({
        type: 'inventory',
        id: item.SKU || item.MedicationName,
        title: item.MedicationName,
        subtitle: `${item.Dose} - ${item.InventoryAvailable} units`,
        href: '/inventory',
        metadata: {
          sku: item.SKU,
          available: item.InventoryAvailable,
          srp: item.SRP,
        },
      })
    }
  }

  return results
}

/**
 * Searches price sheet data.
 */
export function searchPrices(prices: PriceSheet[], query: string, limit = 10): SearchResult[] {
  const results: SearchResult[] = []

  for (const item of prices) {
    if (results.length >= limit) break

    if (matches(item.Product, query) || matches(item.SKU, query) || matches(item.Dose, query)) {
      results.push({
        type: 'product',
        id: item.SKU || item.Product,
        title: item.Product,
        subtitle: `${item.Dose} - $${item.SRP.toFixed(2)}`,
        href: '/pricing',
        metadata: {
          sku: item.SKU,
          cost: item.Cost,
          srp: item.SRP,
        },
      })
    }
  }

  return results
}

/**
 * Performs a global search across all data types.
 */
export function globalSearch(
  query: string,
  data: {
    sales?: Sale[]
    inventory?: Inventory[]
    prices?: PriceSheet[]
  },
  limit = 20
): SearchResult[] {
  if (!query || query.length < 2) return []

  const results: SearchResult[] = []
  const perTypeLimit = Math.ceil(limit / 3)

  if (data.sales) {
    results.push(...searchSales(data.sales, query, perTypeLimit))
  }

  if (data.inventory) {
    results.push(...searchInventory(data.inventory, query, perTypeLimit))
  }

  if (data.prices) {
    results.push(...searchPrices(data.prices, query, perTypeLimit))
  }

  return results.slice(0, limit)
}
