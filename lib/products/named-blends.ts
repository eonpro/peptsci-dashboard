/**
 * Named multi-compound blends (GLOW, KLOW, …).
 *
 * The product form can store either the trade name as Product.name (preferred)
 * or the compound chain ("GHK-Cu and BPC-157 and TB-500") when the blend-name
 * field was left blank. Catalog / pricing / shop UIs should still show the
 * short trade name. Labels and PDPs also need the compound list available as
 * the aka subtitle when the name is the trade name.
 */

/** True when a stored product name looks like a joined compound list. */
export function looksLikeCompoundList(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  if (/\s+and\s+/i.test(trimmed)) return true
  // Slash-separated compounds, but not a lone trade name like "Glow-70".
  const slashParts = trimmed.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean)
  return slashParts.length >= 2 && slashParts.every((p) => /[A-Za-z]/.test(p))
}

/** SKU base without a trailing size suffix: "GLOW-70" → "glow", "GLOW" → "glow". */
export function namedBlendSkuKey(sku: string | null | undefined): string | null {
  if (!sku) return null
  const raw = sku.trim().toLowerCase()
  if (!raw) return null
  const base = raw.replace(/-\d+(?:\.\d+)?$/, '')
  if (base === 'glow' || base === 'klow') return base
  return null
}

function hasToken(haystack: string, token: string): boolean {
  const h = haystack.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const t = token.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return h.includes(t)
}

/**
 * Detect GLOW / KLOW from a compound-list product name when the SKU is missing
 * or not the trade name. KLOW is GHK-Cu + BPC-157 + TB-500 + KPV; GLOW is the
 * three-compound set without KPV.
 */
export function namedBlendFromCompounds(name: string): 'GLOW' | 'KLOW' | null {
  if (!looksLikeCompoundList(name)) return null
  const hasGhk = hasToken(name, 'ghkcu') || hasToken(name, 'ghk')
  const hasBpc = hasToken(name, 'bpc157') || hasToken(name, 'bpc')
  const hasTb = hasToken(name, 'tb500') || hasToken(name, 'tb')
  const hasKpv = hasToken(name, 'kpv')
  if (hasGhk && hasBpc && hasTb && hasKpv) return 'KLOW'
  if (hasGhk && hasBpc && hasTb) return 'GLOW'
  return null
}

/**
 * Trade name when the stored name is a compound chain, or when the SKU/name
 * already is the GLOW/KLOW trade name (normalize casing). Null otherwise.
 */
export function resolveNamedBlendTradeName(
  name: string,
  sku?: string | null
): 'GLOW' | 'KLOW' | null {
  const fromSku = namedBlendSkuKey(sku)
  if (looksLikeCompoundList(name)) {
    if (fromSku === 'glow') return 'GLOW'
    if (fromSku === 'klow') return 'KLOW'
    return namedBlendFromCompounds(name)
  }
  // Already a trade name — normalize casing (Glow → GLOW, Klow 80 → KLOW).
  if (fromSku === 'glow' || /^glow(?:\s+\d+)?$/i.test(name.trim())) return 'GLOW'
  if (fromSku === 'klow' || /^klow(?:\s+\d+)?$/i.test(name.trim())) return 'KLOW'
  return null
}

/** Display name: trade name when applicable, otherwise the stored product name. */
export function displayProductName(name: string, sku?: string | null): string {
  return resolveNamedBlendTradeName(name, sku) ?? name
}

/** Canonical aka subtitle for a named blend (compound order matches label doses). */
export function namedBlendCompoundSubtitle(trade: 'GLOW' | 'KLOW'): string {
  if (trade === 'GLOW') return 'GHK-Cu / BPC-157 / TB-500'
  return 'GHK-Cu / BPC-157 / TB-500 / KPV'
}

/** Turn "A and B and C" / "A / B / C Blend" into an aka subtitle. */
export function compoundListSubtitle(name: string): string {
  return name
    .trim()
    .replace(/\s+blend$/i, '')
    .replace(/\s+and\s+/gi, ' / ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * When promoting a compound-list name to a trade name, keep the compounds as
 * aka unless one is already set. Falls back to the canonical GLOW/KLOW subtitle.
 */
export function displayProductAka(
  name: string,
  sku: string | null | undefined,
  aka: string | null | undefined
): string | null {
  const existing = aka?.trim() || null
  if (existing) return existing
  const trade = resolveNamedBlendTradeName(name, sku)
  if (!trade) return aka ?? null
  if (looksLikeCompoundList(name)) return compoundListSubtitle(name) || namedBlendCompoundSubtitle(trade)
  return namedBlendCompoundSubtitle(trade)
}
