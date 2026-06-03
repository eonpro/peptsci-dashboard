import { isValid } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { getGoogleSheetsConfig } from './config'
import { logger } from './logger'

/**
 * In-process TTL cache for *parsed* Google Sheets results.
 *
 * Google Sheets is used as the analytics datastore, and several admin surfaces
 * (dashboard, customers, P&L, global search) repeatedly re-read and re-parse
 * the full sales/inventory/pricing history. `getSales()` and `getPriceSheet()`
 * also each call `getInventory()`, so a single search request would otherwise
 * fetch inventory 3×. Caching the parsed output for a short TTL (default 60 s)
 * plus de-duplicating concurrent calls collapses that to one fetch+parse per
 * range per window. Tune via SHEETS_CACHE_TTL_MS (set to 0 to disable).
 */
const SHEETS_CACHE_TTL_MS = (() => {
  const raw = process.env.SHEETS_CACHE_TTL_MS
  if (raw === undefined) return 60_000
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 60_000
})()

interface CacheEntry<T> {
  value: T
  expires: number
}

const sheetsCache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = SHEETS_CACHE_TTL_MS
): Promise<T> {
  if (ttlMs <= 0) return fn()

  const now = Date.now()
  const hit = sheetsCache.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expires > now) return hit.value

  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending) return pending

  const promise = (async () => {
    try {
      const value = await fn()
      sheetsCache.set(key, { value, expires: Date.now() + ttlMs })
      return value
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}

/** Clear the parsed-Sheets cache (e.g. after a write or for tests). */
export function clearSheetsCache(): void {
  sheetsCache.clear()
  inflight.clear()
}

// Base function to fetch a range from Google Sheets
export async function fetchRange(range: string): Promise<string[][]> {
  const config = getGoogleSheetsConfig()

  if (!config) {
    return []
  }

  const encodedRange = encodeURIComponent(range)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodedRange}?key=${config.apiKey}`

  const response = await fetch(url, {
    next: { revalidate: 300 }, // 5 minutes cache
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Google Sheets API error: ${response.statusText}`)
  }

  const data = await response.json()
  return data.values || []
}

// Coercion helpers
export function coerceCurrency(value: string): number {
  if (!value) return 0
  const cleaned = value.replace(/[$,]/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export function coerceInt(value: string): number {
  if (!value) return 0
  const num = parseInt(value, 10)
  return isNaN(num) ? 0 : num
}

export function coerceDate(value: string): Date | null {
  if (!value) return null

  try {
    // Try parsing different date formats
    const date = new Date(value)
    if (isValid(date)) {
      return toZonedTime(date, 'America/New_York')
    }
  } catch {
    // Fall through
  }

  return null
}

// Simplified type for sales data that matches our UI needs
export interface Sale {
  Date: Date | null
  OrderID: string
  CustomerName: string
  CustomerEmail: string
  CustomerPhone: string
  Address: string
  City: string
  State: string
  Zip: string
  TrackingNumber: string
  InvoicePaid: boolean
  PaidAmount: number
  Vials: number
  AmountPerVial: number
  Product: string
  Notes: string
  COGS: number
  Profit: number
  ProfitMargin: number
  Markup: number // Added markup percentage
}

export interface Inventory {
  SKU: string
  MedicationName: string
  Dose: string
  SRP: number
  Cost: number // Add Cost per Unit from Column E
  InventoryOrdered: number
  InventoryAvailable: number
  OriginalInventoryAvailable?: number
  UnitsSold?: number
  CalculatedInventoryAvailable?: number
}

export interface PriceSheet {
  SKU: string
  Product: string
  Dose: string
  Cost: number
  SRP: number
  Notes?: string
}

export interface Competitor {
  Competitor: string
  Product: string
  Dose: string
  TheirPrice: number
  OurSRP: number
  Diff?: number
}

// Get sales data from Google Sheets and transform it (cached wrapper)
export async function getSales(): Promise<Sale[]> {
  return cached('sales', getSalesImpl)
}

async function getSalesImpl(): Promise<Sale[]> {
  try {
    // Extended range to include invoice paid status column P
    const rows = await fetchRange('Sales!A:P')

    if (rows.length === 0) return []

    // Get inventory data to lookup actual costs
    const inventory = await getInventory()

    // Create cost lookup map from product name to cost per unit
    const costLookup = new Map<string, number>()
    inventory.forEach((item) => {
      // Try different variations of the product name for matching
      const baseName = item.MedicationName.toLowerCase().trim()
      const withDose = `${baseName} ${item.Dose}`.toLowerCase().trim()

      costLookup.set(baseName, item.Cost)
      costLookup.set(withDose, item.Cost)

      // Also try without spaces for compounds like "BPC-157 / TB-500"
      const normalizedName = baseName.replace(/\s+/g, '').replace(/[^\w]/g, '')
      costLookup.set(normalizedName, item.Cost)
    })

    const headers = rows[0]
    const dataRows = rows.slice(1)

    const sales: Sale[] = []

    // Track order numbers per date for unique IDs
    const orderCountByDate = new Map<string, number>()

    for (const row of dataRows) {
      // Skip empty rows
      if (!row || row.length === 0 || !row.some((cell) => cell && cell.trim())) {
        continue
      }

      // Map row data to column indices based on actual headers
      const rowData: Record<string, string> = {}
      headers.forEach((header, index) => {
        const cellValue = row[index]
        rowData[header] = typeof cellValue === 'string' ? cellValue : ''
      })

      // Parse address to extract city, state, zip
      const fullAddress = rowData['Practice Address'] || ''
      const addressParts = fullAddress.split(',').map((p: string) => p.trim())
      let city = '',
        state = '',
        zip = ''

      if (addressParts.length >= 2) {
        const lastPart = addressParts[addressParts.length - 1]
        const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5})?/)
        if (stateZipMatch) {
          state = stateZipMatch[1] || ''
          zip = stateZipMatch[2] || ''
          city = addressParts[addressParts.length - 2] || ''
        }
      }

      // Generate unique order ID in format P-MMDD-NNN
      let orderID = ''
      const dateStr = rowData['Date'] || ''
      if (dateStr) {
        const dateParts = dateStr.split('/')
        if (dateParts.length >= 2) {
          const month = dateParts[0].padStart(2, '0')
          const day = dateParts[1].padStart(2, '0')
          const dateKey = `${month}${day}`

          // Increment order count for this date
          const orderCount = (orderCountByDate.get(dateKey) || 0) + 1
          orderCountByDate.set(dateKey, orderCount)

          // Format: P-MMDD-NNN
          orderID = `P-${dateKey}-${orderCount.toString().padStart(3, '0')}`
        }
      }

      // Get invoice paid status from column P (index 15)
      const invoicePaidValue = row[15] || ''
      const invoicePaid =
        invoicePaidValue.toLowerCase() === 'yes' ||
        invoicePaidValue.toLowerCase() === 'paid' ||
        invoicePaidValue.toLowerCase() === 'true'

      // Calculate COGS and profit
      const paidAmount = coerceCurrency(rowData['Invoice Total'])
      const vials = coerceInt(rowData['Units #'])
      const amountPerVial = coerceCurrency(rowData['Price/Unit'])

      // Get product name from columns E and F (indices 4 and 5)
      // Column E should have the base product name, Column F should have the dose
      const baseProduct = row[4] || rowData['Treatment'] || ''
      const dose = row[5] || ''
      const product = dose ? `${baseProduct} ${dose}`.trim() : baseProduct

      // Lookup actual cost from inventory data
      let costPerUnit = 0
      const productLower = product.toLowerCase().trim()
      const productNormalized = productLower.replace(/\s+/g, '').replace(/[^\w]/g, '')

      // Try to find matching cost in our lookup
      if (costLookup.has(productLower)) {
        costPerUnit = costLookup.get(productLower)!
      } else if (costLookup.has(productNormalized)) {
        costPerUnit = costLookup.get(productNormalized)!
      } else {
        // Check for partial matches (e.g., "Tirzepatide" in "Tirzepatide 60mg")
        for (const [key, cost] of costLookup.entries()) {
          if (productLower.includes(key) || key.includes(productLower.split(' ')[0])) {
            costPerUnit = cost
            break
          }
        }

        // If still no match, use 35% of selling price as fallback
        if (costPerUnit === 0) {
          costPerUnit = amountPerVial * 0.35
        }
      }

      // Calculate actual COGS based on real cost data
      const cogs = costPerUnit * vials
      const profit = paidAmount - cogs
      const profitMargin = paidAmount > 0 ? (profit / paidAmount) * 100 : 0
      const markup = cogs > 0 ? (profit / cogs) * 100 : 0

      // Create sale object with mapped fields
      const sale: Sale = {
        Date: coerceDate(rowData['Date']),
        OrderID: orderID || `ORD-${rowData['Date']?.replace(/\//g, '')}`,
        CustomerName: rowData['Provider Name'] || '',
        CustomerEmail: rowData['Email'] || '',
        CustomerPhone: rowData['Phone'] || '',
        Address: addressParts[0] || fullAddress,
        City: city,
        State: state,
        Zip: zip,
        TrackingNumber: rowData['Tracking #'] || '',
        InvoicePaid: invoicePaid,
        PaidAmount: paidAmount,
        Vials: vials,
        AmountPerVial: amountPerVial,
        Product: product,
        Notes: rowData['Status'] || '',
        COGS: cogs,
        Profit: profit,
        ProfitMargin: profitMargin,
        Markup: markup,
      }

      // Only add sales with valid data
      if (sale.CustomerName || sale.PaidAmount > 0) {
        sales.push(sale)
      }
    }

    logger.info('Processed sales records', { count: sales.length })
    return sales
  } catch (error) {
    logger.error(
      'Error fetching sales',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return []
  }
}

// Get inventory data from Google Sheets (cached wrapper)
export async function getInventory(): Promise<Inventory[]> {
  return cached('inventory', getInventoryImpl)
}

async function getInventoryImpl(): Promise<Inventory[]> {
  try {
    const rows = await fetchRange('Inventory!A:G') // Fetching through column G (Inventory on hand)

    if (rows.length === 0) return []

    // Skip header row
    const dataRows = rows.slice(1)

    const inventory: Inventory[] = []

    for (const row of dataRows) {
      // Skip empty rows
      if (!row || row.length === 0 || !row.some((cell) => cell && cell.trim())) {
        continue
      }

      // Map to actual column positions based on your sheet:
      // A: SKU, B: Product, C: Dose, D: Suggested Retail Price per Unit,
      // E: Cost per Unit, F: Purchased Inventory, G: Inventory on hand

      const item: Inventory = {
        SKU: row[0] || '', // Column A: SKU
        MedicationName: row[1] || '', // Column B: Product
        Dose: row[2] || '', // Column C: Dose
        SRP: coerceCurrency(row[3]), // Column D: Suggested Retail Price per Unit
        Cost: coerceCurrency(row[4]), // Column E: Cost per Unit
        InventoryOrdered: coerceInt(row[5]), // Column F: Purchased Inventory
        InventoryAvailable: coerceInt(row[6]), // Column G: Inventory on hand
      }

      // Only add items with valid data
      if (item.MedicationName) {
        inventory.push(item)
      }
    }

    logger.info('Processed inventory items', { count: inventory.length })
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

// Get price sheet data from Inventory and Retail Pricing sheets (cached wrapper)
export async function getPriceSheet(): Promise<PriceSheet[]> {
  return cached('priceSheet', getPriceSheetImpl)
}

async function getPriceSheetImpl(): Promise<PriceSheet[]> {
  try {
    const priceSheet: PriceSheet[] = []
    const addedProducts = new Set<string>()

    // First, get inventory data for products in stock
    const inventory = await getInventory()

    // Add inventory items to price sheet
    inventory.forEach((item) => {
      // Normalize product name (fix typos like "Semagltuide" -> "Semaglutide")
      const normalizedProduct = item.MedicationName.replace('Semagltuide', 'Semaglutide')
        .replace('Retatrutide ', 'Retatrutide')
        .trim()

      const productKey = `${normalizedProduct}_${item.Dose}`.toLowerCase()
      if (!addedProducts.has(productKey)) {
        priceSheet.push({
          SKU: item.SKU,
          Product: normalizedProduct,
          Dose: item.Dose,
          Cost: item.Cost, // Column E from Inventory
          SRP: item.SRP, // Column D from Inventory
          Notes: 'In Stock',
        })
        addedProducts.add(productKey)

        // Also add variant keys to prevent duplicates from Retail Pricing
        // This handles minor spelling differences
        addedProducts.add(`${item.MedicationName}_${item.Dose}`.toLowerCase())
        addedProducts.add(`${normalizedProduct.toLowerCase()}_${item.Dose.toLowerCase()}`)
      }
    })

    // Then, fetch from Retail Pricing tab for complete product list
    try {
      const retailRows = await fetchRange('Retail Pricing!A:E')

      if (retailRows.length > 1) {
        // Skip header row
        const retailDataRows = retailRows.slice(1)

        for (const row of retailDataRows) {
          // Skip empty rows
          if (!row || row.length === 0 || !row.some((cell) => cell && cell.trim())) {
            continue
          }

          // Map columns: A=Category, B=Name, C=Strength, D=Retail, E=Cost
          const category = row[0] || '' // This is the category, not SKU
          const product = row[1] || '' // Product name
          const dose = row[2] || '' // Strength/dose
          const srp = coerceCurrency(row[3]) // Column D - Retail price
          const cost = coerceCurrency(row[4]) // Column E - Cost

          if (product) {
            // Normalize product name to check for duplicates
            const normalizedProduct = product
              .replace('Semagltuide', 'Semaglutide')
              .replace('Retatrutide ', 'Retatrutide')
              .trim()

            const productKey = `${normalizedProduct}_${dose}`.toLowerCase()

            // Check multiple variations to see if product exists
            const keyVariations = [
              productKey,
              `${product}_${dose}`.toLowerCase(),
              `${normalizedProduct.toLowerCase()}_${dose.toLowerCase()}`,
            ]

            // Check if product already exists from inventory
            const existingIndex = priceSheet.findIndex(
              (item) =>
                item.Product.toLowerCase() === normalizedProduct.toLowerCase() &&
                item.Dose.toLowerCase() === dose.toLowerCase()
            )

            if (existingIndex >= 0) {
              // Product exists - update with highest price
              const existing = priceSheet[existingIndex]
              if (srp > existing.SRP) {
                priceSheet[existingIndex] = {
                  ...existing,
                  SRP: srp, // Use the higher SRP
                  Cost: cost, // Use the cost associated with higher SRP
                  Notes: existing.Notes === 'In Stock' ? 'In Stock' : category,
                }
              }
              // Also update cost if this one is higher but keep inventory SRP if it's higher
              if (cost > existing.Cost && srp <= existing.SRP) {
                priceSheet[existingIndex].Cost = cost
              }
            } else if (!keyVariations.some((key) => addedProducts.has(key))) {
              // New product - add it
              const generatedSKU = `${product.substring(0, 3).toUpperCase()}${dose.replace(/[^0-9]/g, '')}`

              priceSheet.push({
                SKU: generatedSKU,
                Product: normalizedProduct,
                Dose: dose,
                Cost: cost,
                SRP: srp,
                Notes: category,
              })
              keyVariations.forEach((key) => addedProducts.add(key))
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Retail Pricing tab not found or error reading it', { error: String(error) })
    }

    logger.info('Processed price sheet products', { count: priceSheet.length })

    // Sort by product name and dose
    return priceSheet.sort((a, b) => {
      const productCompare = a.Product.localeCompare(b.Product)
      if (productCompare !== 0) return productCompare
      // Sort by dose if same product
      return a.Dose.localeCompare(b.Dose)
    })
  } catch (error) {
    logger.error(
      'Error fetching price sheet',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return []
  }
}

export async function getCompetitors(): Promise<Competitor[]> {
  return cached('competitors', getCompetitorsImpl)
}

async function getCompetitorsImpl(): Promise<Competitor[]> {
  try {
    // Try fetching from Competitor Comparison tab
    const rows = await fetchRange('Competitor Comparison!A:F')

    if (rows.length === 0) {
      // Return sample data for demo purposes if no sheet data
      return getDefaultCompetitorData()
    }

    // Skip header row
    const dataRows = rows.slice(1)
    const competitors: Competitor[] = []

    for (const row of dataRows) {
      // Skip empty rows
      if (!row || row.length === 0 || !row.some((cell) => cell && cell.trim())) {
        continue
      }

      // Map columns: A=Competitor, B=Product, C=Dose, D=TheirPrice, E=OurSRP, F=Diff
      const competitor: Competitor = {
        Competitor: row[0] || '',
        Product: row[1] || '',
        Dose: row[2] || '',
        TheirPrice: coerceCurrency(row[3]),
        OurSRP: coerceCurrency(row[4]),
        Diff: row[5] ? coerceCurrency(row[5]) : undefined,
      }

      // Calculate diff if not provided
      if (competitor.Diff === undefined) {
        competitor.Diff = competitor.OurSRP - competitor.TheirPrice
      }

      if (competitor.Competitor && competitor.Product) {
        competitors.push(competitor)
      }
    }

    logger.info('Processed competitor records', { count: competitors.length })
    return competitors
  } catch (error) {
    logger.error(
      'Error fetching competitors',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    // Return default data as fallback
    return getDefaultCompetitorData()
  }
}

/**
 * Returns sample competitor data for demo/development purposes.
 * This ensures the Competitors page is functional even without sheet data.
 */
function getDefaultCompetitorData(): Competitor[] {
  return [
    {
      Competitor: 'CompoundingRx',
      Product: 'Semaglutide',
      Dose: '10mg',
      TheirPrice: 450,
      OurSRP: 399,
      Diff: -51,
    },
    {
      Competitor: 'CompoundingRx',
      Product: 'Tirzepatide',
      Dose: '60mg',
      TheirPrice: 950,
      OurSRP: 849,
      Diff: -101,
    },
    {
      Competitor: 'PeptideSource',
      Product: 'Semaglutide',
      Dose: '10mg',
      TheirPrice: 425,
      OurSRP: 399,
      Diff: -26,
    },
    {
      Competitor: 'PeptideSource',
      Product: 'BPC-157',
      Dose: '10mg',
      TheirPrice: 350,
      OurSRP: 299,
      Diff: -51,
    },
    {
      Competitor: 'PeptideSource',
      Product: 'GHK-Cu',
      Dose: '100mg',
      TheirPrice: 500,
      OurSRP: 449,
      Diff: -51,
    },
    {
      Competitor: 'MedCompound',
      Product: 'Semaglutide',
      Dose: '5mg',
      TheirPrice: 275,
      OurSRP: 249,
      Diff: -26,
    },
    {
      Competitor: 'MedCompound',
      Product: 'Tirzepatide',
      Dose: '30mg',
      TheirPrice: 550,
      OurSRP: 499,
      Diff: -51,
    },
    {
      Competitor: 'MedCompound',
      Product: 'Retatrutide',
      Dose: '20mg',
      TheirPrice: 725,
      OurSRP: 649,
      Diff: -76,
    },
    {
      Competitor: 'PharmaCo',
      Product: 'BPC-157',
      Dose: '10mg',
      TheirPrice: 375,
      OurSRP: 299,
      Diff: -76,
    },
    {
      Competitor: 'PharmaCo',
      Product: 'TB-500',
      Dose: '10mg',
      TheirPrice: 325,
      OurSRP: 279,
      Diff: -46,
    },
    {
      Competitor: 'PeptideLabs',
      Product: 'Semaglutide',
      Dose: '10mg',
      TheirPrice: 475,
      OurSRP: 399,
      Diff: -76,
    },
    {
      Competitor: 'PeptideLabs',
      Product: 'NAD+',
      Dose: '500mg',
      TheirPrice: 600,
      OurSRP: 549,
      Diff: -51,
    },
  ]
}
