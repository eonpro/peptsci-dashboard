/**
 * Structured editorial content shown on the product detail page (PDP).
 *
 * Stored as a JSON column on Product (`Product.monograph`) and authored in
 * `lib/content/peptide-monographs.ts`. Editorial rules mirror the reference
 * site: neutral, educational summaries of publicly reported research only —
 * NO therapeutic-efficacy claims and NO dosing recommendations. All figures
 * are framed as "reported in research literature", not guidance.
 */

export interface MonographObservation {
  /** Short bold lead-in, e.g. "Wound-Healing Research". */
  title: string
  /** One or two sentences describing what research has reported. */
  detail: string
}

export interface MonographReference {
  label: string
  /** Optional external link (PubMed / DailyMed search or citation). */
  url?: string
}

export interface PeptideMonograph {
  /** Overview paragraphs. */
  overview: string[]
  /** Mechanism-of-action findings (each rendered as a bullet). */
  mechanismOfAction: string[]
  /** Observations / reported research findings. */
  observations: MonographObservation[]
  /** Clinical / literature references (numbered on the PDP). */
  references: MonographReference[]
  /** Optional override for the default research-use-only disclaimer. */
  disclaimer?: string
}

/**
 * Runtime type guard: validates the loose `Json` value coming out of Prisma
 * into a usable PeptideMonograph. Returns null when the shape is unusable so
 * the PDP can fall back gracefully.
 */
export function parseMonograph(value: unknown): PeptideMonograph | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>

  const strings = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []

  const overview = strings(v.overview)
  const mechanismOfAction = strings(v.mechanismOfAction)

  const observations: MonographObservation[] = Array.isArray(v.observations)
    ? v.observations
        .map((o) => {
          if (!o || typeof o !== 'object') return null
          const obj = o as Record<string, unknown>
          const title = typeof obj.title === 'string' ? obj.title : ''
          const detail = typeof obj.detail === 'string' ? obj.detail : ''
          if (!title && !detail) return null
          return { title, detail }
        })
        .filter((o): o is MonographObservation => o !== null)
    : []

  const references: MonographReference[] = Array.isArray(v.references)
    ? v.references
        .map((r) => {
          if (!r || typeof r !== 'object') return null
          const obj = r as Record<string, unknown>
          const label = typeof obj.label === 'string' ? obj.label : ''
          if (!label) return null
          const url = typeof obj.url === 'string' && obj.url.trim() !== '' ? obj.url : undefined
          return url ? { label, url } : { label }
        })
        .filter((r): r is MonographReference => r !== null)
    : []

  const disclaimer = typeof v.disclaimer === 'string' && v.disclaimer.trim() !== '' ? v.disclaimer : undefined

  // Require at least one populated section to be considered a usable monograph.
  if (
    overview.length === 0 &&
    mechanismOfAction.length === 0 &&
    observations.length === 0 &&
    references.length === 0
  ) {
    return null
  }

  return { overview, mechanismOfAction, observations, references, disclaimer }
}
