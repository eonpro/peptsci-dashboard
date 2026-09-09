/** Client-safe label brand constants (no Node / PDF imports). */

export const ELEVATED_VITALITY_BRAND_KEY = 'elevated_vitality' as const
export const LIVBETR_BRAND_KEY = 'livbetr' as const
export const VITAL_HEALTH_BRAND_KEY = 'vital_health' as const

export const LABEL_BRAND_KEYS = [
  ELEVATED_VITALITY_BRAND_KEY,
  LIVBETR_BRAND_KEY,
  VITAL_HEALTH_BRAND_KEY,
] as const
export type LabelBrandKey = (typeof LABEL_BRAND_KEYS)[number]

export function isLabelBrandKey(value: string | null | undefined): value is LabelBrandKey {
  return Boolean(value && (LABEL_BRAND_KEYS as readonly string[]).includes(value))
}

export const LABEL_BRAND_OPTIONS: Array<{ key: LabelBrandKey; label: string }> = [
  { key: ELEVATED_VITALITY_BRAND_KEY, label: 'Elevated Vitality' },
  { key: LIVBETR_BRAND_KEY, label: 'LIVBETR' },
  { key: VITAL_HEALTH_BRAND_KEY, label: 'Vital Health' },
]

const ORG_NAME_BRAND_HINTS: Array<{ needle: string; key: LabelBrandKey }> = [
  { needle: 'vital health', key: VITAL_HEALTH_BRAND_KEY },
  { needle: 'elevated vitality', key: ELEVATED_VITALITY_BRAND_KEY },
  { needle: 'livbetr', key: LIVBETR_BRAND_KEY },
]

export function inferLabelBrandKeyFromOrgName(name?: string | null): LabelBrandKey | null {
  const n = name?.trim().toLowerCase() ?? ''
  if (!n) return null
  for (const { needle, key } of ORG_NAME_BRAND_HINTS) {
    if (n.includes(needle)) return key
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
