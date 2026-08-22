/**
 * Native web catalog book — page manifest built from the live shop catalog.
 *
 * Only ACTIVE variants already present on the grouped ShopProduct (the same
 * SKUs clinics see in /shop) become product pages. Stale print-catalog sizes
 * and discontinued SKUs are never added here.
 */

import {
  bucketForProduct,
  getShopCategoryBuckets,
  type ShopCategoryBucket,
} from './shop-categories'
import type { ShopProduct, SizeOption } from './types/shop'

export const CATALOG_YEAR = 2026

export const CATALOG_DISCLOSURE =
  'IMPORTANT DISCLOSURE: PeptSci Research is not a compounding pharmacy or chemical compounding facility as defined under Section 503A of the Federal Food, Drug, and Cosmetic Act (FD&C Act). PeptSci Research is also not an outsourcing facility as defined under Section 503B of the FD&C Act. All products are intended solely for laboratory and research use by licensed professionals and are not for human or veterinary use.'

export const BOOK_INTRO_GROUP = 'Introduction'
export const BOOK_RESOURCES_GROUP = 'Resources'

/** Print-catalog category titles, keyed by shop merchandising buckets. */
export const CATEGORY_BOOK_LABEL: Record<ShopCategoryBucket, string> = {
  'Weight Loss': 'Weight Management Research',
  'Growth Hormone': 'Growth Hormone Research',
  'Recovery & Repair': 'Recovery & Performance Research',
  Longevity: 'Longevity & Cellular Health Research',
  Cognitive: 'Cognitive & Neurological Research',
  'Skin & Beauty': 'Skin & Beauty Research',
  Wellness: 'Wellness Research',
  Specialty: 'Additional Research',
}

export type StaticPageId =
  | 'cover'
  | 'about'
  | 'categories'
  | 'shipping'
  | 'white-label'
  | 'back'

export interface BookPageMeta {
  id: string
  tocLabel?: string
  tocGroup?: string
}

interface ManifestBase {
  id: string
  tocLabel?: string
  tocGroup?: string
}

export interface StaticManifestPage extends ManifestBase {
  kind: 'static'
  staticId: StaticPageId
}

export interface CategoryManifestPage extends ManifestBase {
  kind: 'category'
  bucket: ShopCategoryBucket
  /** Product pages that follow this divider (for the category grid). */
  entries: { pageId: string; product: ShopProduct }[]
}

export interface ProductManifestPage extends ManifestBase {
  kind: 'product'
  product: ShopProduct
}

export type CatalogBookPage = StaticManifestPage | CategoryManifestPage | ProductManifestPage

const INTRO_PAGES: StaticManifestPage[] = [
  {
    kind: 'static',
    id: 'cover',
    staticId: 'cover',
    tocLabel: 'Cover',
    tocGroup: BOOK_INTRO_GROUP,
  },
  {
    kind: 'static',
    id: 'about',
    staticId: 'about',
    tocLabel: 'About',
    tocGroup: BOOK_INTRO_GROUP,
  },
  {
    kind: 'static',
    id: 'categories',
    staticId: 'categories',
    tocLabel: 'Research Categories',
    tocGroup: BOOK_INTRO_GROUP,
  },
]

const BACK_PAGES: StaticManifestPage[] = [
  {
    kind: 'static',
    id: 'shipping',
    staticId: 'shipping',
    tocLabel: 'Shipping & Packaging',
    tocGroup: BOOK_RESOURCES_GROUP,
  },
  {
    kind: 'static',
    id: 'white-label',
    staticId: 'white-label',
    tocLabel: 'White-Label Packaging',
    tocGroup: BOOK_RESOURCES_GROUP,
  },
  {
    kind: 'static',
    id: 'back',
    staticId: 'back',
    tocLabel: 'Contact',
    tocGroup: BOOK_RESOURCES_GROUP,
  },
]

/** URL-safe slug for page ids / hash links. */
export function slugifyBookId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Sellable sizes for a grouped catalog card. Drops rows with no SKU so the
 * book never advertises a size we cannot order.
 */
export function offeredSizeOptions(product: ShopProduct): SizeOption[] {
  const sizes =
    product.sizeOptions && product.sizeOptions.length > 0
      ? product.sizeOptions
      : [
          {
            sku: product.sku,
            dose: product.dose,
            displayPrice: product.displayPrice,
            standardPrice: product.standardPrice,
            isCustomPrice: product.isCustomPrice,
            inStock: product.inStock,
            inventoryOnHand: product.inventoryOnHand,
          },
        ]
  return sizes.filter((s) => Boolean(s.sku && s.sku.trim()))
}

/** True when this grouped product has at least one orderable SKU. */
export function isOfferedProduct(product: ShopProduct): boolean {
  if (product.status && product.status !== 'ACTIVE') return false
  return offeredSizeOptions(product).length > 0
}

export function allocateBookProductId(name: string, sku: string, used: Set<string>): string {
  const fromName = slugifyBookId(name)
  const fromSku = slugifyBookId(sku)
  const base = fromName || fromSku || 'product'
  let id = base
  let n = 2
  while (used.has(id)) {
    id = `${base}-${n++}`
  }
  used.add(id)
  return id
}

export interface CatalogBookCategorySummary {
  bucket: ShopCategoryBucket
  label: string
  pageId: string
  productCount: number
}

/**
 * Build the book page list from the grouped shop catalog. Category dividers
 * and product pages are omitted when that bucket has no offered SKUs.
 */
export function buildCatalogBookManifest(products: ShopProduct[]): CatalogBookPage[] {
  const offered = products.filter(isOfferedProduct)
  const usedIds = new Set<string>([...INTRO_PAGES, ...BACK_PAGES].map((p) => p.id))
  const pages: CatalogBookPage[] = [...INTRO_PAGES]

  const buckets = getShopCategoryBuckets(offered) as ShopCategoryBucket[]
  for (const bucket of buckets) {
    const inBucket = offered
      .filter((p) => bucketForProduct(p.category, p.name) === bucket)
      .sort((a, b) => a.name.localeCompare(b.name))
    if (inBucket.length === 0) continue

    const label = CATEGORY_BOOK_LABEL[bucket]
    const categoryId = `cat-${slugifyBookId(bucket)}`
    usedIds.add(categoryId)

    const entries = inBucket.map((product) => ({
      pageId: allocateBookProductId(product.name, product.sku, usedIds),
      product,
    }))

    pages.push({
      kind: 'category',
      id: categoryId,
      bucket,
      entries,
      tocLabel: label,
      tocGroup: label,
    })

    for (const entry of entries) {
      pages.push({
        kind: 'product',
        id: entry.pageId,
        product: entry.product,
        tocLabel: entry.product.name,
        tocGroup: label,
      })
    }
  }

  pages.push(...BACK_PAGES)
  return pages
}

export function catalogBookMeta(pages: CatalogBookPage[]): BookPageMeta[] {
  return pages.map((p) => ({
    id: p.id,
    ...(p.tocLabel ? { tocLabel: p.tocLabel } : {}),
    ...(p.tocGroup ? { tocGroup: p.tocGroup } : {}),
  }))
}

export function catalogBookCategories(pages: CatalogBookPage[]): CatalogBookCategorySummary[] {
  return pages
    .filter((p): p is CategoryManifestPage => p.kind === 'category')
    .map((p) => ({
      bucket: p.bucket,
      label: CATEGORY_BOOK_LABEL[p.bucket],
      pageId: p.id,
      productCount: p.entries.length,
    }))
}

export function formatListPrice(price: number): string | null {
  if (!Number.isFinite(price) || price <= 0) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}
