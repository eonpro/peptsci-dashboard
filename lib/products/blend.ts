/**
 * Blend product name/dose conventions.
 *
 * A blend is stored as a single Product/Variant whose name joins the
 * compounds with "and" ("BPC-157 and TB-500") and whose dose joins the
 * per-compound amounts with " / " ("5mg / 5mg"). This is the exact shape the
 * vial-label renderer expects (see splitProductNameLines / the blend dose box
 * in lib/labels/peptsciLabelPdf.ts), so products created through the blend
 * form print correctly without any extra mapping.
 */

export interface BlendComponent {
  name: string
  /** Per-compound amount, e.g. "5mg". Bare numbers are treated as mg. */
  amount: string
}

/** "5" -> "5mg"; "5 MG" -> "5mg"; keeps anything already unit-qualified. */
export function normalizeBlendAmount(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return `${Number(trimmed)}mg`
  return trimmed.replace(
    /(\d+(?:\.\d+)?)\s*(mg|mcg|iu|ml|g)\b/gi,
    (_m, num: string, unit: string) => `${Number(num)}${unit.toLowerCase()}`
  )
}

/**
 * Compose the stored product name and dose strings from blend components.
 * Components without a name are skipped; the dose is only composed when every
 * kept component has an amount (a partial dose list would misalign the label's
 * two-band dose box).
 */
export function composeBlendProduct(components: BlendComponent[]): {
  name: string
  dose: string
} {
  const kept = components
    .map((c) => ({ name: c.name.trim().replace(/\s+/g, ' '), amount: c.amount.trim() }))
    .filter((c) => c.name !== '')
  const name = kept.map((c) => c.name).join(' and ')
  const dose = kept.every((c) => c.amount !== '')
    ? kept.map((c) => normalizeBlendAmount(c.amount)).join(' / ')
    : ''
  return { name, dose }
}

/**
 * Parse a stored blend product back into per-compound fields for editing.
 * Supports both stored conventions: "A and B" and "A / B [Blend]". Returns
 * null when the name is not a blend. Amounts are matched positionally from a
 * slash-separated dose when the part count lines up.
 */
export function parseBlendProduct(name: string, dose: string): BlendComponent[] | null {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  let parts = trimmed
    .replace(/\s+blend$/i, '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) {
    parts = trimmed.split(/\s+and\s+/i).map((p) => p.trim()).filter(Boolean)
  }
  if (parts.length < 2) return null

  const doseParts = dose
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  const amountsAlign = doseParts.length === parts.length

  return parts.map((part, i) => ({
    name: part,
    amount: amountsAlign ? doseParts[i] : '',
  }))
}
