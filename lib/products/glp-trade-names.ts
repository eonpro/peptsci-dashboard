/**
 * Clinic-facing trade names for the incretin research vials.
 *
 * Stored Product.name stays the INN (Semaglutide / Tirzepatide / Retatrutide)
 * so imports, Shopify maps, and admin search keep working. Shop, catalog book,
 * and vial labels show the short GLP-** code with the INN as the aka subtitle.
 */

export type GlpTradeName = 'GLP-SM' | 'GLP-TZ' | 'GLP-RT'

const GENERIC_BY_TRADE: Record<GlpTradeName, string> = {
  'GLP-SM': 'Semaglutide',
  'GLP-TZ': 'Tirzepatide',
  'GLP-RT': 'Retatrutide',
}

function innKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Map an INN or already-coded name to GLP-SM / GLP-TZ / GLP-RT. */
export function resolveGlpTradeName(name: string): GlpTradeName | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  if (/^glp[\s-]*sm$/i.test(trimmed)) return 'GLP-SM'
  if (/^glp[\s-]*tz$/i.test(trimmed)) return 'GLP-TZ'
  if (/^glp[\s-]*rt$/i.test(trimmed)) return 'GLP-RT'
  const key = innKey(trimmed)
  if (key === 'semaglutide') return 'GLP-SM'
  if (key === 'tirzepatide') return 'GLP-TZ'
  if (key === 'retatrutide') return 'GLP-RT'
  return null
}

export function glpGenericName(trade: GlpTradeName): string {
  return GENERIC_BY_TRADE[trade]
}
