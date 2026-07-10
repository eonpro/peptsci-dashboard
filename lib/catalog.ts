/**
 * Shop product catalog, sourced from Postgres (Product + ProductVariant +
 * ProductMedia). Replaces the former Airtable catalog. Exposes the same
 * function names/shapes the shop pages already consume so callers are
 * unchanged: getProductCatalog, getShopProductBySku, getRelatedShopProducts.
 */

import { prisma } from './prisma'
import { logger } from './logger'
import type { ShopProduct, ProductImage } from './types/shop'

/** Cache tag for the shop product catalog — bust via revalidateTag(CATALOG_TAG). */
export const CATALOG_TAG = 'catalog'

// Prisma's generated payload type isn't imported to keep this file light; the
// shape below matches the `select`/`include` used in the queries.
interface VariantWithProduct {
  id: string
  sku: string | null
  dose: string | null
  unitSize: string | null
  srp: unknown
  unitCost: unknown
  inventoryOnHand: number
  inventoryReserved: number
  status: string
  product: {
    name: string
    description: string | null
    category: string | null
    casNumber: string | null
    molecularFormula: string | null
    molecularWeight: number | null
    pubchemCid: string | null
    media: { id: string; url: string; altText: string | null; isPrimary: boolean }[]
  }
}

function toImages(
  media: { id: string; url: string; altText: string | null; isPrimary: boolean }[]
): ProductImage[] {
  return media.map((m) => ({
    id: m.id,
    url: m.url,
    altText: m.altText ?? undefined,
    isPrimary: m.isPrimary,
  }))
}

function toShopProduct(v: VariantWithProduct): ShopProduct {
  const srp = Number(v.srp)
  // Availability, not gross on-hand: stock already reserved for other open
  // orders isn't purchasable. Prevents showing/selling units that are spoken
  // for and reduces oversell at checkout.
  const available = Math.max(0, v.inventoryOnHand - (v.inventoryReserved || 0))
  return {
    id: v.sku || v.id,
    sku: v.sku || v.id,
    name: v.product.name,
    dose: v.dose || v.unitSize || '',
    description: v.product.description,
    category: v.product.category,
    displayPrice: srp,
    costPrice: Number(v.unitCost),
    casNumber: v.product.casNumber,
    molecularFormula: v.product.molecularFormula,
    molecularWeight:
      v.product.molecularWeight != null ? `${v.product.molecularWeight} g/mol` : null,
    pubchemCid: v.product.pubchemCid,
    images: toImages(v.product.media),
    inventoryOnHand: available,
    inStock: available > 0,
    status: v.status as ShopProduct['status'],
  }
}

const variantInclude = {
  product: {
    select: {
      name: true,
      description: true,
      category: true,
      casNumber: true,
      molecularFormula: true,
      molecularWeight: true,
      pubchemCid: true,
      media: {
        select: { id: true, url: true, altText: true, isPrimary: true },
        orderBy: { isPrimary: 'desc' as const },
      },
    },
  },
}

const variantSelect = {
  id: true,
  sku: true,
  dose: true,
  unitSize: true,
  srp: true,
  unitCost: true,
  inventoryOnHand: true,
  inventoryReserved: true,
  status: true,
  ...variantInclude,
}

/**
 * Full shop catalog: one ShopProduct per active variant.
 */
export async function getProductCatalog(): Promise<{
  source: 'postgres'
  products: ShopProduct[]
}> {
  if (!prisma) return { source: 'postgres', products: [] }
  try {
    const variants = await prisma.productVariant.findMany({
      where: { status: 'ACTIVE' },
      select: variantSelect,
      orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
    })
    const products = (variants as unknown as VariantWithProduct[]).map(toShopProduct)
    logger.info('Loaded shop catalog from Postgres', { count: products.length })
    return { source: 'postgres', products }
  } catch (error) {
    logger.error(
      'Error fetching shop catalog',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return { source: 'postgres', products: [] }
  }
}

/**
 * Fetch a single shop product by exact SKU without loading the catalog.
 */
export async function getShopProductBySku(sku: string): Promise<ShopProduct | null> {
  if (!prisma || !sku) return null
  try {
    const variant = await prisma.productVariant.findUnique({
      where: { sku },
      select: variantSelect,
    })
    if (!variant) return null
    return toShopProduct(variant as unknown as VariantWithProduct)
  } catch (error) {
    logger.warn('Error fetching shop product by SKU', { sku, error: String(error) })
    return null
  }
}

/**
 * Fetch up to `limit` products in the same category (for "related products"),
 * excluding `excludeSku`.
 */
export async function getRelatedShopProducts(
  category: string | null,
  excludeSku: string,
  limit = 4
): Promise<ShopProduct[]> {
  if (!prisma || !category) return []
  try {
    const variants = await prisma.productVariant.findMany({
      where: { status: 'ACTIVE', product: { category } },
      select: variantSelect,
      take: limit + 1,
    })
    return (variants as unknown as VariantWithProduct[])
      .map(toShopProduct)
      .filter((p) => p.sku !== excludeSku)
      .slice(0, limit)
  } catch (error) {
    logger.warn('Error fetching related products', { category, error: String(error) })
    return []
  }
}
