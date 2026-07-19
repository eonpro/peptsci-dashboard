/**
 * Dependency-free conversion between the structured PeptideMonograph JSON and
 * the plain-text form used by the admin dialog and CSV import. Kept pure so it
 * can run in the browser (ProductFormDialog), on the server (import route), and
 * in unit tests.
 *
 * Text conventions (one item per line):
 *  - overview:          one paragraph per line
 *  - mechanismOfAction: one bullet per line
 *  - observations:      "Title | detail" per line (pipe optional)
 *  - references:        "label | url" per line (url optional)
 */
import type {
  PeptideMonograph,
  MonographObservation,
  MonographReference,
} from './types/monograph'

export interface MonographFormFields {
  overview: string
  mechanismOfAction: string
  observations: string
  references: string
}

const lines = (raw: string): string[] =>
  raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

/** Serialize a monograph into editable text fields (for edit mode). */
export function monographToForm(m: PeptideMonograph | null | undefined): MonographFormFields {
  if (!m) return { overview: '', mechanismOfAction: '', observations: '', references: '' }
  return {
    overview: m.overview.join('\n'),
    mechanismOfAction: m.mechanismOfAction.join('\n'),
    observations: m.observations
      .map((o) => (o.title ? `${o.title} | ${o.detail}` : o.detail))
      .join('\n'),
    references: m.references.map((r) => (r.url ? `${r.label} | ${r.url}` : r.label)).join('\n'),
  }
}

function parseObservations(raw: string): MonographObservation[] {
  return lines(raw).map((line) => {
    const idx = line.indexOf('|')
    if (idx === -1) return { title: '', detail: line }
    return { title: line.slice(0, idx).trim(), detail: line.slice(idx + 1).trim() }
  })
}

function parseReferences(raw: string): MonographReference[] {
  return lines(raw).map((line) => {
    const idx = line.indexOf('|')
    if (idx === -1) return { label: line }
    const label = line.slice(0, idx).trim()
    const url = line.slice(idx + 1).trim()
    return url ? { label, url } : { label }
  })
}

/**
 * Build a PeptideMonograph from text fields. Returns null when every section is
 * empty so callers can store `null` rather than an empty object.
 */
export function formToMonograph(fields: Partial<MonographFormFields>): PeptideMonograph | null {
  const overview = lines(fields.overview || '')
  const mechanismOfAction = lines(fields.mechanismOfAction || '')
  const observations = parseObservations(fields.observations || '')
  const references = parseReferences(fields.references || '')

  if (
    overview.length === 0 &&
    mechanismOfAction.length === 0 &&
    observations.length === 0 &&
    references.length === 0
  ) {
    return null
  }

  return { overview, mechanismOfAction, observations, references }
}
