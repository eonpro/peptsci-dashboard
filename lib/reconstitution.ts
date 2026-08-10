/**
 * Pure reconstitution / syringe-unit math for the shop PDP calculator.
 *
 * Concentration (mg/ml) = vialMg / waterMl
 * Draw volume (ml)      = desiredDoseMg / concentration
 * Syringe units (U-100) = drawMl × 100
 * Doses / vial          = vialMg / desiredDoseMg
 */

export type ReconstitutionInput = {
  vialMg: number
  waterMl: number
  /** Desired dose in micrograms (mcg). */
  desiredDoseMcg: number
}

export type ReconstitutionResult = {
  concentrationMgPerMl: number
  injectionVolumeMl: number
  syringeUnits: number
  dosesPerVial: number
}

/** Sum every numeric segment in a dose string (e.g. "10mg/10mg" → 20). */
export function parseTotalVialMg(dose: string | null | undefined): number {
  if (!dose) return 0
  const matches = String(dose)
    .replace(/,/g, '')
    .match(/(\d+(?:\.\d+)?)/g)
  if (!matches || matches.length === 0) return 0
  return matches.reduce((sum, n) => sum + Number(n), 0)
}

export function calculateReconstitution(input: ReconstitutionInput): ReconstitutionResult | null {
  const vialMg = Number(input.vialMg)
  const waterMl = Number(input.waterMl)
  const desiredDoseMcg = Number(input.desiredDoseMcg)

  if (
    !Number.isFinite(vialMg) ||
    !Number.isFinite(waterMl) ||
    !Number.isFinite(desiredDoseMcg) ||
    vialMg <= 0 ||
    waterMl <= 0 ||
    desiredDoseMcg <= 0
  ) {
    return null
  }

  const desiredDoseMg = desiredDoseMcg / 1000
  const concentrationMgPerMl = vialMg / waterMl
  const injectionVolumeMl = desiredDoseMg / concentrationMgPerMl
  const syringeUnits = injectionVolumeMl * 100
  const dosesPerVial = vialMg / desiredDoseMg

  return {
    concentrationMgPerMl,
    injectionVolumeMl,
    syringeUnits,
    dosesPerVial,
  }
}

/** Round for display: one decimal for units/concentration when needed. */
export function formatReconNumber(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—'
  const rounded = Number(n.toFixed(digits))
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits)
}

/**
 * U-100 syringe units for a dose mass at a given reconstitution.
 * units = (doseMg / concentrationMgPerMl) × 100
 */
export function doseMgToSyringeUnits(doseMg: number, vialMg: number, waterMl: number): number | null {
  const vial = Number(vialMg)
  const water = Number(waterMl)
  const dose = Number(doseMg)
  if (!Number.isFinite(vial) || !Number.isFinite(water) || !Number.isFinite(dose)) return null
  if (vial <= 0 || water <= 0 || dose <= 0) return null
  return (dose / (vial / water)) * 100
}

export function doseMcgToSyringeUnits(
  doseMcg: number,
  vialMg: number,
  waterMl: number
): number | null {
  return doseMgToSyringeUnits(Number(doseMcg) / 1000, vialMg, waterMl)
}

/** Inverse of doseMcgToSyringeUnits. */
export function syringeUnitsToDoseMcg(
  units: number,
  vialMg: number,
  waterMl: number
): number | null {
  const vial = Number(vialMg)
  const water = Number(waterMl)
  const u = Number(units)
  if (!Number.isFinite(vial) || !Number.isFinite(water) || !Number.isFinite(u)) return null
  if (vial <= 0 || water <= 0 || u <= 0) return null
  // mcg = units × (vialMg / waterMl) × 10
  return u * (vial / water) * 10
}

/**
 * Convert authored protocol ranges ("300–500 mcg", "2.1–3.5 mg") into
 * U-100 syringe units at the recommended reconstitution. Leaves IU / N/A
 * / non-mass ranges unchanged (returns null).
 */
export function formatDoseRangeAsSyringeUnits(
  range: string,
  vialMg: number,
  waterMl: number
): string | null {
  const raw = String(range || '').trim()
  if (!raw) return null
  if (/iu\b/i.test(raw) || /^n\/a$/i.test(raw) || /protocol-dependent/i.test(raw)) return null
  if (/topical/i.test(raw) || /oral/i.test(raw)) return null

  const match = raw.match(
    /^([\d,]+(?:\.\d+)?)\s*[–-]\s*([\d,]+(?:\.\d+)?)\s*(mcg|µg|ug|mg)\b(.*)$/i
  )
  if (!match) return null

  const low = Number(match[1]!.replace(/,/g, ''))
  const high = Number(match[2]!.replace(/,/g, ''))
  const unit = match[3]!.toLowerCase()
  const suffix = (match[4] || '').trim() // e.g. "total"

  if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0) return null

  const toMg = (n: number) => (unit === 'mg' ? n : n / 1000)
  const lowU = doseMgToSyringeUnits(toMg(low), vialMg, waterMl)
  const highU = doseMgToSyringeUnits(toMg(high), vialMg, waterMl)
  if (lowU == null || highU == null) return null

  const fmt = (n: number) => formatReconNumber(n, n >= 10 ? 0 : 1)
  const base = `${fmt(lowU)}–${fmt(highU)} units`
  return suffix ? `${base} ${suffix}` : base
}

/**
 * Products that are not reconstituted lyophilized peptides (BAC water,
 * accessories, sprays labeled as such, etc.).
 */
export function isReconstitutableProduct(name: string, category?: string | null): boolean {
  const n = (name || '').toLowerCase()
  const c = (category || '').toLowerCase()
  if (!n.trim()) return false
  if (n.includes('bacteriostatic') || n.includes('bac water') || /\bbac\b/.test(n)) return false
  if (n.includes('sterile water') || n.includes('solvent')) return false
  if (
    c.includes('accessor') ||
    c.includes('supply') ||
    c.includes('supplies') ||
    c.includes('solvent')
  ) {
    return false
  }
  if (n.includes('nasal spray') && !n.includes('peptide')) return false
  return true
}
