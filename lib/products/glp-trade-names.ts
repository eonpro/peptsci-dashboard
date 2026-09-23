/**
 * Clinic-facing trade names for the incretin research vials.
 *
 * Stored Product.name stays the INN (Semaglutide / Tirzepatide / Retatrutide)
 * so imports, Shopify maps, and admin search keep working. Every customer- and
 * operator-facing surface shows GLP-SM / GLP-TZ / GLP-RT instead.
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

/** SKU families used for the three incretin vials. Semax is excluded. */
export function resolveGlpTradeNameFromSku(sku?: string | null): GlpTradeName | null {
  if (!sku) return null
  const s = sku.trim()
  if (!s || /^semax/i.test(s)) return null
  if (/^(sema|sm)[-_]?\d/i.test(s)) return 'GLP-SM'
  if (/^(tirz|tz)[-_]?\d/i.test(s) || /^tir[-_]?\d/i.test(s) || /^tr\d/i.test(s)) return 'GLP-TZ'
  if (/^(reta|ret|rt)[-_]?\d/i.test(s)) return 'GLP-RT'
  return null
}

/** Map an INN, frozen batch title, old GLP-R code, or SKU to GLP-SM / GLP-TZ / GLP-RT. */
export function resolveGlpTradeName(name: string, sku?: string | null): GlpTradeName | null {
  const trimmed = name.trim()
  if (trimmed) {
    if (/\bglp[\s-]*sm\b/i.test(trimmed)) return 'GLP-SM'
    if (/\bglp[\s-]*tz\b/i.test(trimmed)) return 'GLP-TZ'
    if (/\bglp[\s-]*rt\b/i.test(trimmed)) return 'GLP-RT'
    // Legacy clinic shorthand "GLP-R 30" — not GLP-1 and not already GLP-RT.
    if (/(?:^|[^a-z0-9])glp[\s-]*r(?!t)(?:\b|\s+\d+)/i.test(trimmed)) return 'GLP-RT'

    if (/\bsemaglutide\b/i.test(trimmed)) return 'GLP-SM'
    if (/\btirzepatide\b/i.test(trimmed)) return 'GLP-TZ'
    if (/\bretatrutide\b/i.test(trimmed)) return 'GLP-RT'

    const key = innKey(trimmed)
    if (key === 'semaglutide' || key.startsWith('semaglutide')) return 'GLP-SM'
    if (key === 'tirzepatide' || key.startsWith('tirzepatide')) return 'GLP-TZ'
    if (key === 'retatrutide' || key.startsWith('retatrutide')) return 'GLP-RT'
  }
  return resolveGlpTradeNameFromSku(sku)
}

export function glpGenericName(trade: GlpTradeName): string {
  return GENERIC_BY_TRADE[trade]
}

/** Extra search tokens so "retatrutide" still finds GLP-RT rows (and vice versa). */
export function glpSearchAliases(name: string, sku?: string | null): string[] {
  const trade = resolveGlpTradeName(name, sku)
  if (!trade) return []
  const aliases = [trade, glpGenericName(trade)]
  if (trade === 'GLP-RT') aliases.push('GLP-R')
  return aliases
}

/** Name + SKU + INN/trade aliases for typeahead and inventory filters. */
export function glpSearchHaystack(name: string, sku?: string | null): string {
  return [name, sku ?? '', ...glpSearchAliases(name, sku)].filter(Boolean).join(' ')
}

/** Replace INN / legacy GLP-R tokens inside a free-text label (sales, emails). */
export function rewriteGlpInnNames(text: string): string {
  return text
    .replace(/\b[Rr]etatrutide\b/g, 'GLP-RT')
    .replace(/\b[Tt]irzepatide\b/g, 'GLP-TZ')
    .replace(/\b[Ss]emaglutide\b/g, 'GLP-SM')
    .replace(/\bGLP[\s-]*R(?!T)\b/gi, 'GLP-RT')
}
