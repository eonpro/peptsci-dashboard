import Airtable from 'airtable'
import { unstable_cache } from 'next/cache'
import { logger } from './logger'
import type { ShopProduct } from './types/shop'

/** Cache tag for the shop product catalog — bust via revalidateTag(CATALOG_TAG). */
export const CATALOG_TAG = 'catalog'

// -------------------------------------------------
// Configuration
// -------------------------------------------------

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID || 'Products'

// Check if Airtable is configured
const isAirtableConfigured = !!(AIRTABLE_API_KEY && AIRTABLE_BASE_ID)

// Initialize Airtable base
const base = isAirtableConfigured
  ? new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!)
  : null

// -------------------------------------------------
// Types matching Airtable schema
// -------------------------------------------------

export interface AirtableProduct {
  id: string // Airtable record ID
  sku: string
  peptideName: string
  milligrams: number
  costPerUnit: number
  category: string | null
  casNumber: string | null
  molecularFormula: string | null
  molecularWeight: string | null
  pubchemCid: string | null
}

// -------------------------------------------------
// Helper functions
// -------------------------------------------------

function mapRecordToProduct(record: Airtable.Record<Airtable.FieldSet>): AirtableProduct {
  return {
    id: record.id,
    sku: (record.get('SKU') as string) || '',
    peptideName: (record.get('Peptide Name') as string) || '',
    milligrams: (record.get('Miligrams') as number) || 0, // Note: "Miligrams" with one 'l'
    costPerUnit: (record.get('Cost/Unit') as number) || 0,
    category: (record.get('Category') as string) || null,
    casNumber: (record.get('CAS Number') as string) || null,
    molecularFormula: (record.get('Molecular Formula') as string) || null,
    molecularWeight: (record.get('Molecular Weight (g/mol)') as string) || null,
    pubchemCid: (record.get('PubChem CID') as string) || null,
  }
}

// -------------------------------------------------
// Query functions
// -------------------------------------------------

/**
 * Fetch all products from Airtable.
 * Caches via Next.js revalidation (5 minutes by default).
 */
export async function getAirtableProducts(): Promise<AirtableProduct[]> {
  if (!base) {
    logger.warn('Airtable not configured - returning empty products')
    return []
  }

  try {
    const records = await base(AIRTABLE_TABLE_ID)
      .select({
        view: 'Grid view',
      })
      .all()

    const products = records.map(mapRecordToProduct)
    logger.info('Fetched products from Airtable', { count: products.length })
    return products
  } catch (error) {
    logger.error(
      'Error fetching Airtable products',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return []
  }
}

/**
 * Fetch a single product by SKU.
 */
export async function getAirtableProductBySku(sku: string): Promise<AirtableProduct | null> {
  if (!base) {
    return null
  }

  try {
    const records = await base(AIRTABLE_TABLE_ID)
      .select({
        filterByFormula: `{SKU} = "${sku}"`,
        maxRecords: 1,
      })
      .all()

    if (records.length === 0) {
      return null
    }

    return mapRecordToProduct(records[0])
  } catch (error) {
    logger.error(
      'Error fetching Airtable product by SKU',
      { sku },
      error instanceof Error ? error : new Error(String(error))
    )
    return null
  }
}

/**
 * Fetch a single product by Airtable record ID.
 */
export async function getAirtableProductById(id: string): Promise<AirtableProduct | null> {
  if (!base) {
    return null
  }

  try {
    const record = await base(AIRTABLE_TABLE_ID).find(id)
    return mapRecordToProduct(record)
  } catch (error) {
    logger.error(
      'Error fetching Airtable product by ID',
      { id },
      error instanceof Error ? error : new Error(String(error))
    )
    return null
  }
}

/**
 * Search products by name or category.
 */
export async function searchAirtableProducts(query: string): Promise<AirtableProduct[]> {
  if (!base || !query.trim()) {
    return []
  }

  try {
    const searchTerm = query.toLowerCase()
    const records = await base(AIRTABLE_TABLE_ID)
      .select({
        filterByFormula: `OR(
          FIND(LOWER("${searchTerm}"), LOWER({Peptide Name})),
          FIND(LOWER("${searchTerm}"), LOWER({Category})),
          FIND(LOWER("${searchTerm}"), LOWER({SKU}))
        )`,
      })
      .all()

    return records.map(mapRecordToProduct)
  } catch (error) {
    logger.error(
      'Error searching Airtable products',
      { query },
      error instanceof Error ? error : new Error(String(error))
    )
    return []
  }
}

/**
 * Get unique categories from products.
 */
export async function getAirtableCategories(): Promise<string[]> {
  const products = await getAirtableProducts()
  const categories = new Set<string>()

  products.forEach((product) => {
    if (product.category) {
      categories.add(product.category)
    }
  })

  return Array.from(categories).sort()
}

// -------------------------------------------------
// Shop Integration
// -------------------------------------------------

/**
 * Convert Airtable product to ShopProduct format.
 * Uses a markup multiplier for retail pricing (Cost/Unit is wholesale).
 */
function convertToShopProduct(product: AirtableProduct, index: number): ShopProduct {
  // Apply markup to wholesale cost for retail price
  // Default 2x markup - can be adjusted per category or customer tier
  const MARKUP_MULTIPLIER = 2.0
  const retailPrice = Math.round(product.costPerUnit * MARKUP_MULTIPLIER * 100) / 100

  // Format dose string - handle various formats
  let dose = ''
  if (product.milligrams && product.milligrams > 0) {
    // Check if it's a whole number or has decimals
    dose = Number.isInteger(product.milligrams) 
      ? `${product.milligrams}mg` 
      : `${product.milligrams}mg`
  }

  return {
    id: product.sku || `${product.peptideName}-${product.milligrams}-${index}`,
    sku: product.sku,
    airtableId: product.id,
    name: product.peptideName,
    dose,
    milligrams: product.milligrams, // Also pass raw milligrams
    description: product.molecularFormula
      ? `CAS: ${product.casNumber || 'N/A'} | Formula: ${product.molecularFormula}`
      : null,
    category: product.category,
    displayPrice: retailPrice,
    costPrice: product.costPerUnit,
    images: [],
    status: 'ACTIVE' as const,
    specifications: product.molecularWeight
      ? `Molecular Weight: ${product.molecularWeight}`
      : null,
    // Scientific details
    casNumber: product.casNumber,
    molecularFormula: product.molecularFormula,
    molecularWeight: product.molecularWeight,
    pubchemCid: product.pubchemCid,
  }
}

/**
 * Get products from Airtable for shop display.
 * Returns unified ShopProduct type with retail pricing.
 */
// The Airtable catalog is a slow, rate-limited external call that the public
// shop renders constantly. Cache the converted catalog in Next's data cache
// (revalidate every 5 min, or on demand via revalidateTag(CATALOG_TAG) from
// product-mutation routes) so repeat renders don't re-hit Airtable.
const getCachedAirtableCatalog = unstable_cache(
  async (): Promise<ShopProduct[]> => {
    const airtableProducts = await getAirtableProducts()
    return airtableProducts.map((p, i) => convertToShopProduct(p, i))
  },
  ['shop-catalog'],
  { revalidate: 300, tags: [CATALOG_TAG] }
)

export async function getProductCatalog(): Promise<{
  source: 'airtable' | 'sheets'
  products: ShopProduct[]
}> {
  // Try Airtable first
  if (isAirtableConfigured) {
    try {
      const products = await getCachedAirtableCatalog()

      if (products.length > 0) {
        logger.info('Loaded products from Airtable (cached)', { count: products.length })
        return { source: 'airtable', products }
      }
    } catch (error) {
      logger.warn('Airtable fetch failed, falling back to Sheets', { error: String(error) })
    }
  }

  // Fall back to Google Sheets
  const sheetsModule = await import('./sheets')
  const inventory = await sheetsModule.getInventory()
  const products: ShopProduct[] = inventory.map((item, index) => ({
    id: item.SKU || `${item.MedicationName}-${item.Dose}-${index}`,
    sku: item.SKU,
    name: item.MedicationName,
    dose: item.Dose,
    description: null,
    category: item.MedicationName.split(' ')[0],
    displayPrice: item.SRP,
    images: [],
    inventoryOnHand: item.InventoryAvailable,
    inStock: item.InventoryAvailable > 0,
    status: 'ACTIVE' as const,
  }))

  return { source: 'sheets', products }
}

/**
 * Fetch a single shop product (with retail pricing applied) by exact SKU,
 * WITHOUT pulling the entire catalog. Returns null when Airtable is not
 * configured or the SKU isn't found (callers can fall back to the catalog).
 */
export async function getShopProductBySku(sku: string): Promise<ShopProduct | null> {
  if (!isAirtableConfigured) return null
  const product = await getAirtableProductBySku(sku)
  return product ? convertToShopProduct(product, 0) : null
}

/**
 * Fetch up to `limit` shop products in the same category (for "related
 * products"), excluding `excludeSku`. Uses a category-filtered Airtable query
 * instead of scanning the whole catalog.
 */
export async function getRelatedShopProducts(
  category: string | null,
  excludeSku: string,
  limit = 4
): Promise<ShopProduct[]> {
  if (!base || !category) return []
  try {
    // Escape double quotes to keep the formula well-formed.
    const safeCategory = category.replace(/"/g, '\\"')
    const records = await base(AIRTABLE_TABLE_ID)
      .select({
        filterByFormula: `{Category} = "${safeCategory}"`,
        maxRecords: limit + 1,
      })
      .all()
    return records
      .map((r, i) => convertToShopProduct(mapRecordToProduct(r), i))
      .filter((p) => p.sku !== excludeSku)
      .slice(0, limit)
  } catch (error) {
    logger.warn('Error fetching related products by category', {
      category,
      error: String(error),
    })
    return []
  }
}

/**
 * Check if Airtable is currently configured and usable.
 */
export function isAirtableEnabled(): boolean {
  return isAirtableConfigured
}
