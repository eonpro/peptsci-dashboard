/** Client-safe label brand constants (no Node / PDF imports). */

export const ELEVATED_VITALITY_BRAND_KEY = 'elevated_vitality' as const
export const LIVBETR_BRAND_KEY = 'livbetr' as const
export const VITAL_HEALTH_BRAND_KEY = 'vital_health' as const
export const ELEMENT_LABS_BRAND_KEY = 'element_labs' as const
export const TIME_ACADEMY_BRAND_KEY = 'time_academy' as const

export const LABEL_BRAND_KEYS = [
  ELEVATED_VITALITY_BRAND_KEY,
  LIVBETR_BRAND_KEY,
  VITAL_HEALTH_BRAND_KEY,
  ELEMENT_LABS_BRAND_KEY,
  TIME_ACADEMY_BRAND_KEY,
] as const
export type LabelBrandKey = (typeof LABEL_BRAND_KEYS)[number]

export function isLabelBrandKey(value: string | null | undefined): value is LabelBrandKey {
  return Boolean(value && (LABEL_BRAND_KEYS as readonly string[]).includes(value))
}

/** White-label brands printed on the PeptSci face (built from its artwork). */
export const PEPTSCI_FACE_BRAND_KEYS: readonly LabelBrandKey[] = [
  VITAL_HEALTH_BRAND_KEY,
  ELEMENT_LABS_BRAND_KEY,
]

/** White-label brands whose vials print the physician-use PUO mark. */
const PHYSICIAN_USE_BRAND_KEYS: readonly LabelBrandKey[] = [
  ...PEPTSCI_FACE_BRAND_KEYS,
  TIME_ACADEMY_BRAND_KEY,
]

/**
 * Vials for this brand carry the physician-use wording (PUO): PeptSci and its
 * face ("PHYSICIAN USE ONLY / NOT FOR CONSUMPTION"), and TIME Academy (PUO
 * mark, no warning line). Livbetr and Elevated Vitality artwork still says
 * research use only.
 */
export function usesPhysicianUseLabels(brandKey: string | null | undefined): boolean {
  if (!isLabelBrandKey(brandKey)) return true
  return PHYSICIAN_USE_BRAND_KEYS.includes(brandKey)
}

export const LABEL_BRAND_OPTIONS: Array<{ key: LabelBrandKey; label: string }> = [
  { key: ELEVATED_VITALITY_BRAND_KEY, label: 'Elevated Vitality' },
  { key: LIVBETR_BRAND_KEY, label: 'LIVBETR' },
  { key: VITAL_HEALTH_BRAND_KEY, label: 'Vital Health' },
  { key: ELEMENT_LABS_BRAND_KEY, label: 'Element Labs' },
  { key: TIME_ACADEMY_BRAND_KEY, label: 'TIME Academy' },
]

/** Matched as whole words, so "Lifetime Academy" is not TIME Academy. */
const ORG_NAME_BRAND_HINTS: Array<{ pattern: RegExp; key: LabelBrandKey }> = [
  { pattern: /\bvital health\b/, key: VITAL_HEALTH_BRAND_KEY },
  { pattern: /\belement labs\b/, key: ELEMENT_LABS_BRAND_KEY },
  { pattern: /\btime academy\b/, key: TIME_ACADEMY_BRAND_KEY },
  { pattern: /\belevated vitality\b/, key: ELEVATED_VITALITY_BRAND_KEY },
  { pattern: /\blivbetr\b/, key: LIVBETR_BRAND_KEY },
]

export function inferLabelBrandKeyFromOrgName(name?: string | null): LabelBrandKey | null {
  const n = name?.trim().toLowerCase() ?? ''
  if (!n) return null
  for (const { pattern, key } of ORG_NAME_BRAND_HINTS) {
    if (pattern.test(n)) return key
  }
  return null
}

export function resolveLabelBrandKey(client: {
  whiteLabelEnabled?: boolean | null
  labelBrandKey?: string | null
  organizationName?: string | null
}): LabelBrandKey | null {
  if (client.whiteLabelEnabled && isLabelBrandKey(client.labelBrandKey)) {
    return client.labelBrandKey
  }
  // Brand was chosen then turned off — stay on PeptSci even if the org name matches.
  if (isLabelBrandKey(client.labelBrandKey)) return null
  return inferLabelBrandKeyFromOrgName(client.organizationName)
}
