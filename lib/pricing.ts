/**
 * Pricing module, sourced entirely from Postgres (ProductVariant). Google
 * Sheets has been removed; the catalog is the single source of truth.
 */

import { prisma } from './prisma'
import { logger } from './logger'

/**
 * Price-sheet row shape (relocated from the former lib/sheets.ts). Used by the
 * pricing exports, the PO generator, and global search.
 */
export interface PriceSheet {
  SKU: string
  Product: string
  Dose: string
  Cost: number
  SRP: number
  Notes?: string
  /** ProductVariant id, when known — enables in-place price editing. */
  Id?: string
}

// Unified pricing type
export interface ProductPrice {
  id: string
  sku: string
  productName: string
  dose: string
  unitCost: number
  srp: number
  inventoryOnHand: number
  status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED'
  source: 'postgres'
}

export interface ClientPrice extends ProductPrice {
  customPrice: number | null
  discountPercent: number | null
  priceNotes: string | null
}

/**
 * Get all active product pricing from Postgres.
 */
export async function getPricing(): Promise<{
  source: 'postgres'
  prices: ProductPrice[]
}> {
  if (!prisma) return { source: 'postgres', prices: [] }

  try {
    const variants = await prisma.productVariant.findMany({
      where: { status: 'ACTIVE' },
      include: {
        product: {
          select: {
            name: true,
            category: true,
          },
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
    })

    const prices: ProductPrice[] = variants.map((v) => ({
      id: v.id,
      sku: v.sku || `${v.product.name.substring(0, 3).toUpperCase()}-${v.dose}`,
      productName: v.product.name,
      dose: v.dose || '',
      unitCost: Number(v.unitCost),
      srp: Number(v.srp),
      inventoryOnHand: v.inventoryOnHand,
      status: v.status as ProductPrice['status'],
      source: 'postgres' as const,
    }))

    logger.info('Fetched pricing from Postgres', { count: prices.length })
    return { source: 'postgres', prices }
  } catch (error) {
    logger.error('Failed to fetch pricing', {}, error as Error)
    return { source: 'postgres', prices: [] }
  }
}

/**
 * Price-sheet view (SKU/Product/Dose/Cost/SRP) derived from Postgres pricing.
 * Kept for the PO generator and global search which consume the `PriceSheet`
 * shape that previously came from Google Sheets.
 */
export async function getPriceSheet(): Promise<PriceSheet[]> {
  const { prices } = await getPricing()
  return prices.map((p) => ({
    SKU: p.sku,
    Product: p.productName,
    Dose: p.dose,
    Cost: p.unitCost,
    SRP: p.srp,
    Notes: p.inventoryOnHand > 0 ? 'In Stock' : undefined,
  }))
}

/**
 * Get pricing for a specific client, including any custom pricing.
 */
export async function getClientPricing(clientId: string): Promise<{
  source: 'postgres'
  prices: ClientPrice[]
}> {
  // Get base pricing
  const { source, prices } = await getPricing()

  if (!prisma) {
    return {
      source,
      prices: prices.map((p) => ({
        ...p,
        customPrice: null,
        discountPercent: null,
        priceNotes: null,
      })),
    }
  }

  // Get custom pricing for this client
  try {
    const customPricing = await prisma.clientPricing.findMany({
      where: {
        clientId,
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
        ],
      },
    })

    // Create a map of variant ID -> custom pricing
    const customPriceMap = new Map(customPricing.map((cp) => [cp.variantId, cp]))

    // Merge custom pricing with base pricing
    const clientPrices: ClientPrice[] = prices.map((p) => {
      const custom = customPriceMap.get(p.id)
      return {
        ...p,
        customPrice: custom ? Number(custom.customPrice) : null,
        discountPercent: custom?.discountPercent ? Number(custom.discountPercent) : null,
        priceNotes: custom?.notes || null,
      }
    })

    return { source: 'postgres', prices: clientPrices }
  } catch (error) {
    logger.error('Failed to fetch client pricing', { clientId }, error as Error)
    return {
      source,
      prices: prices.map((p) => ({
        ...p,
        customPrice: null,
        discountPercent: null,
        priceNotes: null,
      })),
    }
  }
}

/**
 * Get a single product's pricing by SKU. Queries just that variant from
 * Postgres (indexed unique SKU) instead of loading the entire catalog; falls
 * back to the full pricing list only when Postgres is unavailable.
 */
export async function getProductPriceBySku(sku: string): Promise<ProductPrice | null> {
  if (prisma) {
    try {
      const v = await prisma.productVariant.findUnique({
        where: { sku },
        include: { product: { select: { name: true } } },
      })
      if (v) {
        return {
          id: v.id,
          sku: v.sku || `${v.product.name.substring(0, 3).toUpperCase()}-${v.dose}`,
          productName: v.product.name,
          dose: v.dose || '',
          unitCost: Number(v.unitCost),
          srp: Number(v.srp),
          inventoryOnHand: v.inventoryOnHand,
          status: v.status as ProductPrice['status'],
          source: 'postgres',
        }
      }
    } catch (error) {
      logger.warn('Single-SKU price lookup failed, falling back to full pricing', {
        sku,
        error: String(error),
      })
    }
  }

  const { prices } = await getPricing()
  return prices.find((p) => p.sku === sku) || null
}

/**
 * Set custom pricing for a client.
 * Requires Postgres to be connected.
 */
export async function setClientPricing(
  clientId: string,
  variantId: string,
  customPrice: number,
  options?: {
    discountPercent?: number
    notes?: string
    validFrom?: Date
    validUntil?: Date
    createdBy?: string
  }
): Promise<{ success: boolean; error?: string }> {
  if (!prisma) {
    return { success: false, error: 'Database not connected' }
  }

  try {
    await prisma.clientPricing.upsert({
      where: {
        clientId_variantId: {
          clientId,
          variantId,
        },
      },
      update: {
        customPrice,
        discountPercent: options?.discountPercent,
        notes: options?.notes,
        validFrom: options?.validFrom,
        validUntil: options?.validUntil,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        clientId,
        variantId,
        customPrice,
        discountPercent: options?.discountPercent,
        notes: options?.notes,
        validFrom: options?.validFrom,
        validUntil: options?.validUntil,
        isActive: true,
        createdBy: options?.createdBy,
      },
    })

    logger.info('Set client pricing', { clientId, variantId, customPrice })
    return { success: true }
  } catch (error) {
    logger.error('Failed to set client pricing', { clientId, variantId }, error as Error)
    return { success: false, error: 'Failed to set pricing' }
  }
}

/**
 * Remove custom pricing for a client.
 */
export async function removeClientPricing(
  clientId: string,
  variantId: string
): Promise<{ success: boolean; error?: string }> {
  if (!prisma) {
    return { success: false, error: 'Database not connected' }
  }

  try {
    await prisma.clientPricing.updateMany({
      where: { clientId, variantId },
      data: { isActive: false },
    })

    logger.info('Removed client pricing', { clientId, variantId })
    return { success: true }
  } catch (error) {
    logger.error('Failed to remove client pricing', { clientId, variantId }, error as Error)
    return { success: false, error: 'Failed to remove pricing' }
  }
}

/**
 * Calculate the effective price for a client.
 * Uses custom price if available, otherwise SRP.
 */
export function getEffectivePrice(clientPrice: ClientPrice): { price: number; isCustom: boolean } {
  if (clientPrice.customPrice !== null) {
    return { price: clientPrice.customPrice, isCustom: true }
  }
  return { price: clientPrice.srp, isCustom: false }
}

/**
 * Build a map of SKU -> active custom price for a client.
 *
 * The shop catalog comes from Airtable/Sheets (keyed by SKU) while custom
 * pricing lives in Postgres (keyed by variant). This bridges them by SKU so
 * client-specific prices can be overlaid onto catalog products.
 */
export async function getClientPriceMapBySku(
  clientId: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!prisma || !clientId) return map

  try {
    const rows = await prisma.clientPricing.findMany({
      where: {
        clientId,
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
        ],
      },
      include: { variant: { select: { sku: true } } },
    })

    for (const row of rows) {
      const sku = row.variant.sku
      if (sku) map.set(sku, Number(row.customPrice))
    }
  } catch (error) {
    logger.warn('Failed to load client price map', { clientId, error: String(error) })
  }

  return map
}
