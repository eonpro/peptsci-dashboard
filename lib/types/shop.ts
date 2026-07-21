import type { PeptideMonograph } from './monograph'

/**
 * Unified product type for the shop.
 * Works with both Airtable and Google Sheets data sources.
 */

// Compound information for blends and detailed product specs
export interface CompoundInfo {
  name: string
  amount: string // e.g., "5mg"
  casNumber?: string
  molecularFormula?: string
  molecularWeight?: string
  purity?: string
}

/**
 * One purchasable mg size of a product — used to render size pickers on
 * grouped catalog cards and the PDP without carrying the full ShopProduct.
 */
export interface SizeOption {
  sku: string
  dose: string
  displayPrice: number
  standardPrice?: number
  isCustomPrice?: boolean
  inStock?: boolean
  inventoryOnHand?: number
}

export interface ShopProduct {
  // Identifiers
  id: string // Unique identifier (SKU or generated)
  sku: string // Product SKU
  parentProductId?: string // Postgres Product.id — groups sibling mg variants
  airtableId?: string // Airtable record ID (if from Airtable)

  // Basic info
  name: string // Product display name
  dose: string // Dosage (e.g., "10mg", "60mg")
  milligrams?: number // Raw milligrams value from Airtable
  description: string | null // Product description (rich text from Airtable)
  category: string | null // Product category

  // Pricing (from Postgres for accuracy, display from source)
  displayPrice: number // Display price (effective price for the viewing client)
  standardPrice?: number // List/SRP before any client-specific override
  isCustomPrice?: boolean // True when displayPrice reflects a client-specific price

  // Media
  images: ProductImage[] // Product images

  // Inventory (from Postgres)
  inventoryOnHand?: number // Current stock level
  inStock?: boolean // Whether product is available

  // Status
  status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED'

  // Extended content (from Airtable)
  specifications?: string | null
  usageInstructions?: string | null
  storageRequirements?: string | null
  tags?: string[]

  // Scientific details (for detailed product cards)
  productType?: 'Blend' | 'Single' | 'Stack' | 'Custom'
  compounds?: CompoundInfo[]
  totalAmount?: string
  isPRUO?: boolean // Physician Research Use Only
  disclaimer?: string

  // Airtable scientific data
  casNumber?: string | null
  molecularFormula?: string | null
  molecularWeight?: string | null
  pubchemCid?: string | null

  // Editorial monograph content shown on the product detail page.
  monograph?: PeptideMonograph | null
  purity?: string | null // e.g. "99%"; PDP falls back to a default when absent
  availableDoses?: string[] // sibling variant doses of the same compound
  aka?: string | null // "also known as" — rendered as a smaller subtitle under the name

  // True when a published Certificate of Analysis exists for this variant
  // (enriched server-side on the shop page).
  hasCoa?: boolean

  // All purchasable sizes of this compound (set when the catalog is grouped
  // one-card-per-product; the card links to the PDP where a size is chosen).
  sizeOptions?: SizeOption[]
}

export interface ProductImage {
  id: string
  url: string
  altText?: string
  isPrimary?: boolean
  thumbnails?: {
    small?: string
    medium?: string
    large?: string
  }
}

/**
 * Lightweight product for cart items.
 */
export interface CartProduct {
  id: string
  productId: string
  name: string
  dose: string
  sku: string
  price: number
  quantity: number
  image?: string
}

/** Numeric value of a dose string ("5mg" -> 5, "10mg/10mg" -> 10) for sorting. */
function doseValue(dose: string): number {
  const n = parseFloat(dose)
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}

/**
 * Collapse a variant-level catalog (one ShopProduct per mg size) into one
 * ShopProduct per compound. The representative is the cheapest priced size
 * (so price sorting/"From $X" works naturally) and carries `sizeOptions`
 * for every sellable size. Must run AFTER client pricing is applied so the
 * size prices reflect the viewing client's rates.
 */
export function groupProductsByParent(products: ShopProduct[]): ShopProduct[] {
  const groups = new Map<string, ShopProduct[]>()
  for (const p of products) {
    const key = p.parentProductId || p.name
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }

  const grouped: ShopProduct[] = []
  for (const variants of groups.values()) {
    const byDose = [...variants].sort((a, b) => doseValue(a.dose) - doseValue(b.dose))
    // Cheapest priced size fronts the card; fall back to the smallest dose.
    const priced = byDose.filter((v) => v.displayPrice > 0)
    const representative =
      priced.length > 0
        ? priced.reduce((min, v) => (v.displayPrice < min.displayPrice ? v : min))
        : byDose[0]

    grouped.push({
      ...representative,
      inStock: byDose.some((v) => v.inStock !== false),
      // Keep the representative's own COA flag — the card's COA dialog loads
      // by the representative SKU, so advertising a sibling's COA would 404.
      availableDoses: byDose.map((v) => v.dose).filter(Boolean),
      sizeOptions: byDose.map((v) => ({
        sku: v.sku,
        dose: v.dose,
        displayPrice: v.displayPrice,
        standardPrice: v.standardPrice,
        isCustomPrice: v.isCustomPrice,
        inStock: v.inStock,
        inventoryOnHand: v.inventoryOnHand,
      })),
    })
  }
  return grouped
}

/**
 * Product filter options for the catalog.
 */
export interface ProductFilters {
  search?: string
  category?: string
  minPrice?: number
  maxPrice?: number
  inStockOnly?: boolean
  sortBy?: 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc'
}

/**
 * Apply filters to a product list.
 */
export function filterProducts(products: ShopProduct[], filters: ProductFilters): ShopProduct[] {
  let filtered = [...products]

  // Search filter
  if (filters.search) {
    const query = filters.search.toLowerCase()
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.dose.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query) ||
        // Grouped cards: match any of the sibling sizes' SKUs/doses too.
        p.sizeOptions?.some(
          (o) => o.sku.toLowerCase().includes(query) || o.dose.toLowerCase().includes(query)
        )
    )
  }

  // Category filter
  if (filters.category && filters.category !== 'all') {
    filtered = filtered.filter((p) => p.category?.toLowerCase() === filters.category?.toLowerCase())
  }

  // Price range
  if (filters.minPrice !== undefined) {
    filtered = filtered.filter((p) => p.displayPrice >= filters.minPrice!)
  }
  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter((p) => p.displayPrice <= filters.maxPrice!)
  }

  // In stock filter
  if (filters.inStockOnly) {
    filtered = filtered.filter((p) => p.inStock !== false)
  }

  // Sort
  if (filters.sortBy) {
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name)
        case 'name-desc':
          return b.name.localeCompare(a.name)
        case 'price-asc':
          return a.displayPrice - b.displayPrice
        case 'price-desc':
          return b.displayPrice - a.displayPrice
        default:
          return 0
      }
    })
  }

  return filtered
}

/**
 * Extract unique categories from products.
 */
export function getCategories(products: ShopProduct[]): string[] {
  const categories = new Set<string>()
  products.forEach((p) => {
    if (p.category) {
      categories.add(p.category)
    }
  })
  return Array.from(categories).sort()
}
