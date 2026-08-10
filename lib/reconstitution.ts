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
