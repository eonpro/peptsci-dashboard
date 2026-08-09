/**
 * Shop product catalog, sourced from Postgres (Product + ProductVariant +
 * ProductMedia). Replaces the former Airtable catalog. Exposes the same
 * function names/shapes the shop pages already consume so callers are
 * unchanged: getProductCatalog, getShopProductBySku, getRelatedShopProducts.
 */

import { prisma } from './prisma'
import { stockEnforcementEnabled } from './stock-enforcement'
import { logger } from './logger'
import type { ShopProduct, ProductImage, CompoundInfo } from './types/shop'
import { parseMonograph } from './types/monograph'
import { getBlendComposition } from './content/blend-compositions'
import { getCompoundChemistry } from './content/compound-chemistry'
import { displayProductAka, displayProductName } from './products/named-blends'

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
  inventoryOnHand: number
  inventoryReserved: number
  status: string
  productId: string
  product: {
    name: string
    description: string | null
    category: string | null
    casNumber: string | null
    molecularFormula: string | null
    molecularWeight: number | null
    pubchemCid: string | null
    monograph: unknown
    purity: string | null
    aka: string | null
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

/**
 * Multi-peptide blends (Glow, Klow, BPC-157 / TB-500, ...) resolve their
 * component chemistry by product name. Per-component doses are read positionally
 * from the variant dose string ("10mg/10mg/50mg" -> one segment per component)
 * so the catalog card, vial label, and PDP all render the same breakdown.
 */
function blendCompounds(name: string, dose: string | null): CompoundInfo[] | null {
  const composition = getBlendComposition(name)
  if (!composition) return null
  const doses = (dose || '')
    .split(/\s*[/+]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  const hasPartDoses = doses.length === composition.length
  return composition.map((c, i) => ({
    name: c.name,
    amount: hasPartDoses ? doses[i] : '',
    casNumber: c.casNumber,
    molecularFormula: c.molecularFormula,
    molecularWeight: c.molecularWeight,
    purity: c.purity,
  }))
}

function toShopProduct(v: VariantWithProduct): ShopProduct {
  const srp = Number(v.srp)
  // Availability, not gross on-hand: stock already reserved for other open
  // orders isn't purchasable. Prevents showing/selling units that are spoken
  // for and reduces oversell at checkout. Only surfaced when stock
  // enforcement is on — otherwise unmaintained (all-zero) counts would mark
  // the entire catalog "Out of Stock".
  const enforceStock = stockEnforcementEnabled()
  const available = Math.max(0, v.inventoryOnHand - (v.inventoryReserved || 0))
  const displayName = displayProductName(v.product.name, v.sku)
  const compounds = blendCompounds(displayName, v.dose) ?? blendCompounds(v.product.name, v.dose)
  // Singles: fill missing sci fields from the verified chemistry map so cards
  // don't render empty CAS/Formula/MW gaps. Never override DB values. Blends
  // use per-component chemistry via `compounds` instead.
  const chem = compounds ? null : getCompoundChemistry(displayName) ?? getCompoundChemistry(v.product.name)
  const molecularWeight =
    v.product.molecularWeight != null
      ? `${v.product.molecularWeight} g/mol`
      : chem?.molecularWeight != null
        ? `${chem.molecularWeight} g/mol`
        : null
  return {
    id: v.sku || v.id,
    sku: v.sku || v.id,
    parentProductId: v.productId,
    name: displayName,
    dose: v.dose || v.unitSize || '',
    ...(compounds ? { productType: 'Blend' as const, compounds } : {}),
    description: v.product.description,
    category: v.product.category ?? chem?.category ?? null,
    displayPrice: srp,
    // SECURITY: never include unitCost here — ShopProduct is serialized into
    // client-facing pages (/shop, /sf) and would expose our margins.
    casNumber: v.product.casNumber ?? chem?.casNumber ?? null,
    molecularFormula: v.product.molecularFormula ?? chem?.molecularFormula ?? null,
    molecularWeight,
    pubchemCid: v.product.pubchemCid ?? chem?.pubchemCid ?? null,
    monograph: parseMonograph(v.product.monograph),
    purity: v.product.purity ?? chem?.purity ?? null,
    aka: displayProductAka(v.product.name, v.sku, v.product.aka),
    images: toImages(v.product.media),
    inventoryOnHand: enforceStock ? available : undefined,
    inStock: enforceStock ? available > 0 : true,
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
      monograph: true,
      purity: true,
      aka: true,
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
  inventoryOnHand: true,
  inventoryReserved: true,
  status: true,
  productId: true,
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
    // Clients may only see what we can actually ship: SKUs with zero sellable
    // availability (onHand − reserved) are hidden from the listing. `inStock`
    // is always true when stock enforcement is off, so the
    // CHECKOUT_ENFORCE_STOCK=false escape hatch keeps the full catalog visible.
    const products = (variants as unknown as VariantWithProduct[])
      .map(toShopProduct)
      .filter((p) => p.inStock !== false)
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
    // Match the catalog listing: discontinued/inactive SKUs are not shoppable
    // even via a direct product URL (checkout would reject them anyway).
    if (!variant || variant.status !== 'ACTIVE') return null
    const typed = variant as unknown as VariantWithProduct
    const product = toShopProduct(typed)

    // "Available in: 5mg, 10mg" — the sellable doses of the same compound.
    // Sizes with no sellable stock are omitted (they're hidden from the
    // catalog too), unless stock enforcement is off.
    const enforceStock = stockEnforcementEnabled()
    const siblings = await prisma.productVariant.findMany({
      where: { productId: typed.productId, status: 'ACTIVE' },
      select: { dose: true, unitSize: true, inventoryOnHand: true, inventoryReserved: true },
      orderBy: { dose: 'asc' },
    })
    const sellableSiblings = enforceStock
      ? siblings.filter((s) => s.inventoryOnHand - (s.inventoryReserved || 0) > 0)
      : siblings
    const doses = Array.from(
      new Set(
        sellableSiblings
          .map((s) => (s.dose || s.unitSize || '').trim())
          .filter((d) => d.length > 0)
      )
    )
    product.availableDoses = doses

    return product
  } catch (error) {
    logger.warn('Error fetching shop product by SKU', { sku, error: String(error) })
    return null
  }
}

/**
 * All ACTIVE sibling variants (mg sizes) of the same parent product, as
 * ShopProducts — powers the size selector on the product detail page.
 */
export async function getSiblingShopProducts(productId: string): Promise<ShopProduct[]> {
  if (!prisma || !productId) return []
  try {
    const variants = await prisma.productVariant.findMany({
      where: { productId, status: 'ACTIVE' },
      select: variantSelect,
      orderBy: { dose: 'asc' },
    })
    // Out-of-stock sizes aren't offered in the size selector (mirrors the
    // catalog listing; no-op when stock enforcement is off).
    return (variants as unknown as VariantWithProduct[])
      .map(toShopProduct)
      .filter((p) => p.inStock !== false)
  } catch (error) {
    logger.warn('Error fetching sibling variants', { productId, error: String(error) })
    return []
  }
}

/**
 * Fetch up to `limit` distinct products in the same category (for "related
 * products"), excluding the parent product `excludeProductId`. Variants are
 * fetched generously so callers can group them one-card-per-product and still
 * have `limit` cards.
 */
export async function getRelatedShopProducts(
  category: string | null,
  excludeProductId: string,
  limit = 4
): Promise<ShopProduct[]> {
  if (!prisma || !category) return []
  try {
    const variants = await prisma.productVariant.findMany({
      where: {
        status: 'ACTIVE',
        product: { category },
        NOT: { productId: excludeProductId },
      },
      select: variantSelect,
      orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
      // Enough variants to yield `limit` distinct parents after grouping.
      take: limit * 6,
    })
    // Mirror the catalog listing: only sellable (in-stock) SKUs are shown.
    return (variants as unknown as VariantWithProduct[])
      .map(toShopProduct)
      .filter((p) => p.inStock !== false)
  } catch (error) {
    logger.warn('Error fetching related products', { category, error: String(error) })
    return []
  }
}
