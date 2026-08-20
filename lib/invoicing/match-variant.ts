/**
 * Pure catalog-label matching (no Prisma). Safe for client components —
 * e.g. ConvertStripeModal → stripe-line-map.
 */

import { looksLikeCompoundList } from '../products/named-blends'
import { parseBlendProduct } from '../products/blend'

export type CatalogVariantRow = {
  id: string
  sku: string | null
  productName: string
  dose: string | null
}

/**
 * Best-effort: match invoice description labels from the admin product picker
 * (`Name Dose · SKU`) back to catalog variants when `variantId` was not stored
 * (e.g. INV-00001 created before the column existed).
 *
 * Also used for Stripe convert auto-map — normalizes `10mg` vs `10.0mg` so
 * hosted-invoice descriptions line up with catalog dose strings.
 */
export function normalizeProductDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(\d+)\.0+(?=\s*mg\b)/gi, '$1')
    .replace(/(\d+)\s*mg\b/gi, '$1mg')
    .trim()
}

function compoundKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function sortedKeys(keys: string[]): string {
  return [...keys].filter(Boolean).sort().join('|')
}

function normalizeDoseToken(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '').replace(/(\d+)\.0+mg\b/g, '$1mg')
}

/** Shopify/ops titles like "BPC-157 10MG+TB-500 10MG BLEND". */
export function descriptionLooksLikeBlend(description: string): boolean {
  const d = description.trim()
  if (!d) return false
  if (/\bblend\b/i.test(d)) return true
  if (d.includes('+')) return true
  return looksLikeCompoundList(d)
}

function parseTitleCompounds(
  description: string
): { compounds: string[]; doses: string[] } | null {
  const s = description
    .replace(/\+/g, ' and ')
    .replace(/\s+blend\s*$/i, '')
    .trim()
  const parts = s
    .split(/\s+and\s+|\s*\/\s*/i)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  const compounds: string[] = []
  const doses: string[] = []
  for (const part of parts) {
    const m = part.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*mg$/i)
    if (m?.[1] && m[2]) {
      compounds.push(compoundKey(m[1]))
      doses.push(normalizeDoseToken(`${m[2]}mg`))
    } else {
      compounds.push(compoundKey(part))
    }
  }
  if (compounds.some((c) => !c) || new Set(compounds).size < 2) return null
  return { compounds, doses }
}

function catalogBlendSignature(row: CatalogVariantRow): {
  compounds: string[]
  doses: string[]
} | null {
  const parsed = parseBlendProduct(row.productName, row.dose || '')
  if (!parsed || parsed.length < 2) return null
  const compounds = parsed.map((p) => compoundKey(p.name)).filter(Boolean)
  if (new Set(compounds).size < 2) return null
  const doses = parsed
    .map((p) => normalizeDoseToken(p.amount))
    .filter((d) => /^\d+(?:\.\d+)?mg$/.test(d))
  return { compounds, doses }
}

function matchBlendVariantId(
  description: string,
  catalog: CatalogVariantRow[]
): string | null {
  const wanted = parseTitleCompounds(description)
  if (!wanted) return null
  const wantedCompounds = sortedKeys(wanted.compounds)
  const candidates = catalog.filter((row) => {
    const sig = catalogBlendSignature(row)
    if (!sig) return false
    return sortedKeys(sig.compounds) === wantedCompounds
  })
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]!.id
  if (wanted.doses.length >= 2) {
    const wantedDoses = sortedKeys(wanted.doses)
    const doseHits = candidates.filter((row) => {
      const sig = catalogBlendSignature(row)
      return sig != null && sortedKeys(sig.doses) === wantedDoses
    })
    if (doseHits.length === 1) return doseHits[0]!.id
  }
  return null
}

export function matchVariantIdFromDescription(
  description: string,
  catalog: CatalogVariantRow[]
): string | null {
  const desc = description.trim()
  if (!desc) return null

  // Prefer exact SKU after middot / dash separators used in invoice labels.
  const skuPart = desc.includes('·')
    ? desc.split('·').pop()?.trim()
    : desc.includes(' - ')
      ? desc.split(' - ').pop()?.trim()
      : null
  if (skuPart) {
    const bySku = catalog.find((v) => v.sku && v.sku.toLowerCase() === skuPart.toLowerCase())
    if (bySku) return bySku.id
  }
  // Bare SKU match when description is only the SKU.
  const byExactSku = catalog.find((v) => v.sku && v.sku.toLowerCase() === desc.toLowerCase())
  if (byExactSku) return byExactSku.id

  // Blend titles must not fall through to "BPC-157 10mg" / "TB-500 10mg"
  // startsWith hits. Shopify sends "BPC-157 10MG+TB-500 10MG BLEND".
  if (descriptionLooksLikeBlend(desc)) {
    const blendHit = matchBlendVariantId(desc, catalog)
    if (blendHit) return blendHit
  }

  const normalized = normalizeProductDescription(desc)
  const exactHits: string[] = []
  for (const v of catalog) {
    const label = normalizeProductDescription(
      `${v.productName}${v.dose ? ` ${v.dose}` : ''}${v.sku ? ` · ${v.sku}` : ''}`
    )
    if (label === normalized) {
      exactHits.push(v.id)
      continue
    }
    const withoutSku = normalizeProductDescription(
      `${v.productName}${v.dose ? ` ${v.dose}` : ''}`
    )
    if (withoutSku && (normalized === withoutSku || normalized.startsWith(withoutSku + ' '))) {
      exactHits.push(v.id)
    }
  }
  if (exactHits.length === 1) return exactHits[0]
  if (exactHits.length > 1) {
    // Prefer the tightest without-SKU equality over startsWith collisions.
    const tight = catalog.filter((v) => {
      const withoutSku = normalizeProductDescription(
        `${v.productName}${v.dose ? ` ${v.dose}` : ''}`
      )
      return withoutSku === normalized
    })
    if (tight.length === 1) return tight[0].id
    return null
  }
  return null
}

/**
 * When a Shopify/invoice title is clearly a multi-compound blend, do not keep
 * a single-peptide mapping (TB-500 10mg for a BPC+TB blend line).
 */
export function correctMappedVariantForTitle(
  title: string,
  mappedId: string | null,
  catalog: CatalogVariantRow[]
): string | null {
  if (!descriptionLooksLikeBlend(title)) return mappedId
  const mapped = mappedId ? catalog.find((row) => row.id === mappedId) : null
  if (mapped && looksLikeCompoundList(mapped.productName)) return mappedId
  return matchVariantIdFromDescription(title, catalog) ?? mappedId
}
