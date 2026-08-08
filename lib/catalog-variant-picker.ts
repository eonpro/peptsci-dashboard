/**
 * Shared product-picker search for admin order flows (manual order, Stripe
 * convert). Token match + in-stock-first ranking so common catalogs (many
 * Tirzepatide doses) don't bury the variant the operator needs behind an
 * arbitrary top-N of zero-stock SKUs.
 */

export type CatalogVariantSearchRow = {
  id: string
  sku: string | null
  productName: string
  dose: string | null
  available: number
}

/** Default dropdown length — large enough for full dose families (e.g. Tirz). */
export const CATALOG_VARIANT_PICKER_LIMIT = 25

function searchableText(v: CatalogVariantSearchRow): string {
  return `${v.productName} ${v.dose ?? ''} ${v.sku ?? ''}`.toLowerCase()
}

/** Leading numeric dose in mg (or first number in the dose string). */
export function parseDoseMg(dose: string | null | undefined): number {
  if (!dose) return Number.POSITIVE_INFINITY
  const m = String(dose)
    .replace(/,/g, '')
    .match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY
}

/**
 * Strip Stripe/sales fluff like "+1 more" so a payment description can seed
 * the product search box.
 */
export function suggestProductQueryFromDescription(product: string | null | undefined): string {
  if (!product) return ''
  return product
    .replace(/\s*\+\d+\s+more\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Filter + rank catalog variants for a typeahead picker.
 * - Every whitespace token must appear somewhere in name/dose/SKU
 * - In-stock variants rank above zero-stock; then higher available, name, dose
 */
export function filterCatalogVariantsForPicker<T extends CatalogVariantSearchRow>(
  variants: readonly T[],
  query: string,
  limit: number = CATALOG_VARIANT_PICKER_LIMIT
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  const matched = variants.filter((v) => {
    const hay = searchableText(v)
    return tokens.every((t) => hay.includes(t))
  })

  matched.sort((a, b) => {
    const aInStock = a.available > 0 ? 1 : 0
    const bInStock = b.available > 0 ? 1 : 0
    if (aInStock !== bInStock) return bInStock - aInStock
    if (a.available !== b.available) return b.available - a.available
    const nameCmp = a.productName.localeCompare(b.productName, undefined, { sensitivity: 'base' })
    if (nameCmp !== 0) return nameCmp
    const doseCmp = parseDoseMg(a.dose) - parseDoseMg(b.dose)
    if (doseCmp !== 0) return doseCmp
    return (a.sku || '').localeCompare(b.sku || '', undefined, { sensitivity: 'base' })
  })

  return matched.slice(0, Math.max(0, limit))
}
