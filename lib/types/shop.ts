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

export interface ShopProduct {
  // Identifiers
  id: string // Unique identifier (SKU or generated)
  sku: string // Product SKU
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

  // True when a published Certificate of Analysis exists for this variant
  // (enriched server-side on the shop page).
  hasCoa?: boolean
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
        p.category?.toLowerCase().includes(query)
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
