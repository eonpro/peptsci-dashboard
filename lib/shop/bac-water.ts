/**
 * Bacteriostatic water SKUs, vial presentation, and checkout upsell math.
 *
 * 3 mL / 10 mL carry a PeptSci label (volume only — no mg, purity, or RUO).
 * 30 mL is the Hospira-branded bottle (product photo, no PeptSci label).
 * Checkout offers one vial per peptide vial when BAC water is not already in the cart.
 */

export const BAC_WATER_PRODUCT_NAME = 'Bacteriostatic Water'

export const BAC_WATER_SKUS = {
  labeled3ml: 'BAC-H2O-3ML',
  labeled10ml: 'BAC-H2O-10ML',
  hospira30ml: 'BAC-H2O-30ML',
} as const

export type BacWaterPresentation = 'peptsci-label' | 'hospira'

export interface BacWaterSize {
  sku: string
  dose: string
  listPrice: number
  presentation: BacWaterPresentation
}

export const BAC_WATER_SIZES: readonly BacWaterSize[] = [
  {
    sku: BAC_WATER_SKUS.labeled3ml,
    dose: '3mL',
    listPrice: 5,
    presentation: 'peptsci-label',
  },
  {
    sku: BAC_WATER_SKUS.labeled10ml,
    dose: '10mL',
    listPrice: 10,
    presentation: 'peptsci-label',
  },
  {
    sku: BAC_WATER_SKUS.hospira30ml,
    dose: '30mL',
    listPrice: 20,
    presentation: 'hospira',
  },
] as const

export const BAC_WATER_CATALOG_BLURB = [
  'Sterile bacteriostatic water (0.9% benzyl alcohol) for reconstituting lyophilized research peptides.',
  '3 mL and 10 mL vials carry the PeptSci label. The 30 mL option is the Hospira-branded bottle.',
]

const ML_RE = /(\d+(?:\.\d+)?)\s*ml\b/i

function skuLooksLikeBacWater(sku: string | null | undefined): boolean {
  const s = (sku || '').toLowerCase()
  if (!s) return false
  const compact = s.replace(/[^a-z0-9]/g, '')
  if (s.includes('bacwater') || s.includes('bac-h2o') || s.includes('bac-h20')) return true
  if (s.startsWith('bac-h2o') || s.startsWith('bac-h20')) return true
  return compact.startsWith('bach2o') || compact.startsWith('bach20')
}

export function isBacteriostaticWaterProduct(name: string, sku?: string | null): boolean {
  const n = (name || '').toLowerCase()
  if (n.trim()) {
    if (n.includes('bacteriostatic')) return true
    if (n.includes('bac water') || n.includes('bac-water')) return true
    if (n.includes('bac-h2o') || n.includes('bac-h20') || n.includes('bach2o') || n.includes('bacwater')) return true
  }
  return skuLooksLikeBacWater(sku)
}

/**
 * Leftover production SKU `BAC-H20` (and other 0mg / unlabeled BAC vials) is
 * the Hospira 30 mL bottle — never 3 mL / 10 mL.
 */
export function isLegacyBacWaterThirtyMl(sku?: string | null, dose?: string | null): boolean {
  const s = (sku || '').toLowerCase()
  const d = (dose || '').replace(/\s+/g, '').toLowerCase()
  if (/3ml|10ml/.test(s) || /^(3|10)ml$/.test(d)) return false
  if (s === 'bac-h20' || s === 'bac-h2o' || s === 'bac-h2o-30ml' || s === 'bac-h20-30ml') return true
  if (d === '30ml') return true
  const compact = s.replace(/[^a-z0-9]/g, '')
  if (compact === 'bach20' || compact === 'bach2o') return d === '' || d === '0mg' || d === '0' || d === '30ml'
  return skuLooksLikeBacWater(sku) && (d === '' || d === '0mg' || d === '0')
}

function mlFromText(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(ML_RE)
  if (!match) return null
  const n = parseFloat(match[1])
  return Number.isFinite(n) ? n : null
}

/** Volume in milliliters from dose, SKU, or name (3 / 10 / 30). */
export function bacWaterVolumeMl(name: string, dose?: string | null, sku?: string | null): number | null {
  return (
    mlFromText(dose) ??
    mlFromText(sku) ??
    mlFromText(name) ??
    (isLegacyBacWaterThirtyMl(sku, dose) ? 30 : null)
  )
}

/** Catalog / shop chip: never print 0mg for BAC water. */
export function formatBacWaterSizeLabel(dose?: string | null, sku?: string | null): string {
  const ml = bacWaterVolumeMl('', dose, sku)
  if (ml === 3) return '3mL'
  if (ml === 10) return '10mL'
  if (ml === 30) return '30mL'
  if (ml != null && ml > 0) return `${ml}mL`
  return '30mL'
}

export interface BacWaterCatalogRow {
  sku: string
  dose: string
  displayPrice: number
  standardPrice?: number
  isCustomPrice?: boolean
  inStock?: boolean
  inventoryOnHand?: number
}

/**
 * Always emit the three sellable BAC-water sizes for the catalog book.
 * Live variants (including leftover `BAC-H20` / 0mg) map onto 3 / 10 / 30 mL.
 */
export function bacWaterCatalogRows(live: BacWaterCatalogRow[]): BacWaterCatalogRow[] {
  const claimed = new Set<number>()
  return BAC_WATER_SIZES.map((size) => {
    const wantMl = parseInt(size.dose, 10)
    const idx = live.findIndex((row, i) => {
      if (claimed.has(i)) return false
      if ((row.sku || '').toLowerCase() === size.sku.toLowerCase()) return true
      const ml = bacWaterVolumeMl('', row.dose, row.sku)
      if (ml != null && Math.round(ml) === wantMl) return true
      if (wantMl === 30 && isLegacyBacWaterThirtyMl(row.sku, row.dose)) return true
      return false
    })
    if (idx >= 0) {
      claimed.add(idx)
      const row = live[idx]
      return {
        ...row,
        dose: size.dose,
        displayPrice: size.listPrice,
        standardPrice: size.listPrice,
      }
    }
    return {
      sku: size.sku,
      dose: size.dose,
      displayPrice: size.listPrice,
      standardPrice: size.listPrice,
      isCustomPrice: false,
      inStock: true,
    }
  })
}

export function usesPeptSciBacLabel(name: string, dose?: string | null, sku?: string | null): boolean {
  if (!isBacteriostaticWaterProduct(name, sku)) return false
  const ml = bacWaterVolumeMl(name, dose, sku)
  return ml === 3 || ml === 10
}

export function usesHospiraBacPhoto(name: string, dose?: string | null, sku?: string | null): boolean {
  if (!isBacteriostaticWaterProduct(name, sku)) return false
  if (usesPeptSciBacLabel(name, dose, sku)) return false
  return true
}

/** Volume printed on the PeptSci BAC-water label (no mg). */
export function bacWaterLabelVolume(name: string, dose?: string | null, sku?: string | null): string {
  const ml = bacWaterVolumeMl(name, dose, sku)
  if (ml === 10) return '10mL'
  return '3mL'
}

export function omitsPeptideSciSpecs(name: string, sku?: string | null): boolean {
  return isBacteriostaticWaterProduct(name, sku)
}

export interface BacWaterCartLine {
  name: string
  sku?: string | null
  dose?: string | null
  quantity: number
}

export function cartHasBacWater(items: BacWaterCartLine[]): boolean {
  return items.some((item) => isBacteriostaticWaterProduct(item.name, item.sku))
}

/** Peptide / research vials in the cart (excludes BAC water itself). */
export function peptideVialCount(items: BacWaterCartLine[]): number {
  return items.reduce((sum, item) => {
    if (isBacteriostaticWaterProduct(item.name, item.sku)) return sum
    return sum + Math.max(0, Math.floor(item.quantity) || 0)
  }, 0)
}

/**
 * Offer BAC water at checkout when the cart has peptide vials and no BAC water
 * has been added yet. Suggested qty is one BAC vial per peptide vial.
 */
export function shouldOfferBacWaterAtCheckout(items: BacWaterCartLine[]): boolean {
  return peptideVialCount(items) > 0 && !cartHasBacWater(items)
}

export function suggestedBacWaterQty(items: BacWaterCartLine[]): number {
  return peptideVialCount(items)
}
