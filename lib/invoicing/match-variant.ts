/**
 * Pure catalog-label matching (no Prisma). Safe for client components —
 * e.g. ConvertStripeModal → stripe-line-map.
 */

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

export function matchVariantIdFromDescription(
  description: string,
  catalog: Array<{ id: string; sku: string | null; productName: string; dose: string | null }>
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
