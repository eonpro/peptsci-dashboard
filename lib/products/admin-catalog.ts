import type { CompoundInfo, ShopProduct } from '@/lib/types/shop'
import { resolveBlendCompounds } from '@/lib/content/blend-compositions'
import { getCompoundChemistry } from '@/lib/content/compound-chemistry'
import { displayProductAka, displayProductName } from '@/lib/products/named-blends'

/** Flattened admin catalog row (one SKU / mg size). */
export interface AdminCatalogVariant {
  id: string
  sku: string | null
  productId?: string | null
  productName: string
  category: string | null
  dose: string | null
  srp: number
  unitCost: number
  supplierName: string | null
  supplierSku: string | null
  inventoryOnHand: number
  reorderLevel: number
  imageUrl: string | null
  coaCount?: number
  aka?: string | null
  purity?: string | null
  description?: string | null
  casNumber?: string | null
  molecularFormula?: string | null
  molecularWeight?: number | null
  pubchemCid?: string | null
}

function blendCompounds(name: string, dose: string | null): CompoundInfo[] | null {
  const composition = resolveBlendCompounds(name, dose)
  if (!composition) return null
  return composition.map((c) => ({
    name: c.name,
    amount: c.amount || '',
    casNumber: c.casNumber,
    molecularFormula: c.molecularFormula,
    molecularWeight: c.molecularWeight,
    purity: c.purity,
  }))
}

/**
 * Map an admin inventory SKU onto the shop catalog shape so staff products
 * can reuse the client vial cards (chemistry, blends, generated labels).
 */
export function variantToShopProduct(v: AdminCatalogVariant): ShopProduct {
  const sku = v.sku || v.id
  const displayName = displayProductName(v.productName, sku)
  const compounds =
    blendCompounds(displayName, v.dose) ?? blendCompounds(v.productName, v.dose)
  const chem = compounds
    ? null
    : getCompoundChemistry(displayName) ?? getCompoundChemistry(v.productName)
  const molecularWeight =
    v.molecularWeight != null
      ? `${v.molecularWeight} g/mol`
      : chem?.molecularWeight != null
        ? `${chem.molecularWeight} g/mol`
        : null

  return {
    id: sku,
    sku,
    parentProductId: v.productId ?? undefined,
    name: displayName,
    dose: v.dose || '',
    ...(compounds ? { productType: 'Blend' as const, compounds } : {}),
    description: v.description ?? null,
    category: v.category ?? chem?.category ?? null,
    displayPrice: v.srp,
    casNumber: v.casNumber ?? chem?.casNumber ?? null,
    molecularFormula: v.molecularFormula ?? chem?.molecularFormula ?? null,
    molecularWeight,
    pubchemCid: v.pubchemCid ?? chem?.pubchemCid ?? null,
    purity: v.purity ?? chem?.purity ?? null,
    aka: displayProductAka(v.productName, sku, v.aka),
    images: v.imageUrl ? [{ id: v.id, url: v.imageUrl, isPrimary: true }] : [],
    inventoryOnHand: v.inventoryOnHand,
    inStock: v.inventoryOnHand > 0,
    status: 'ACTIVE',
    hasCoa: (v.coaCount ?? 0) > 0,
  }
}
