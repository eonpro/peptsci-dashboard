/** Client-safe label brand constants (no Node / PDF imports). */

export const ELEVATED_VITALITY_BRAND_KEY = 'elevated_vitality' as const
export const LIVBETR_BRAND_KEY = 'livbetr' as const

export const LABEL_BRAND_KEYS = [ELEVATED_VITALITY_BRAND_KEY, LIVBETR_BRAND_KEY] as const
export type LabelBrandKey = (typeof LABEL_BRAND_KEYS)[number]

export function isLabelBrandKey(value: string | null | undefined): value is LabelBrandKey {
  return Boolean(value && (LABEL_BRAND_KEYS as readonly string[]).includes(value))
}

export const LABEL_BRAND_OPTIONS: Array<{ key: LabelBrandKey; label: string }> = [
  { key: ELEVATED_VITALITY_BRAND_KEY, label: 'Elevated Vitality' },
  { key: LIVBETR_BRAND_KEY, label: 'LIVBETR' },
]

export function resolveLabelBrandKey(client: {
  whiteLabelEnabled?: boolean | null
  labelBrandKey?: string | null
}): LabelBrandKey | null {
  if (!client.whiteLabelEnabled) return null
  if (!isLabelBrandKey(client.labelBrandKey)) return null
  return client.labelBrandKey
}
