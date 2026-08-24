/**
 * Blend-aware helpers for Certificates of Analysis.
 *
 * A blend vial is still one ProductVariant, but the lab issues one certificate
 * per peptide. Assay % of claim is always that peptide's mg (Ipamorelin 5.93 /
 * 5 = 118.6%), never the summed vial dose (10 + 5). These helpers keep the
 * admin form, preview, and fulfillment pack on that rule.
 */

import { parseBlendProduct } from './products/blend'
import { resolveBlendCompounds } from './content/blend-compositions'
import { getCompoundChemistry } from './content/compound-chemistry'

export interface CoaBlendPart {
  name: string
  /** Per-peptide amount as stored on the variant, e.g. "5mg". */
  amount: string
  /** Numeric mg for the assay label-claim field; null when the amount is not mg. */
  labelClaimMg: number | null
  casNumber: string | null
}

export interface CoaBlendMatch<T extends { compoundName: string }> {
  part: CoaBlendPart
  coa: T
}

export interface BlendCoverage<T extends { compoundName: string }> {
  matched: CoaBlendMatch<T>[]
  missing: CoaBlendPart[]
  extra: T[]
}

/** Numeric mg from a single-compound dose. Blend doses return null — never sum. */
export function milligramsFromDoseLabel(dose: string | null | undefined): number | null {
  if (!dose) return null
  const trimmed = dose.trim()
  if (!trimmed) return null
  if (/[/+]|\band\b/i.test(trimmed)) return null
  const m = trimmed.match(/^(\d+(?:\.\d+)?)\s*(mg)?$/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function chemistryCas(name: string): string | null {
  return getCompoundChemistry(name)?.casNumber ?? null
}

function toPart(name: string, amount: string, casNumber?: string | null): CoaBlendPart {
  return {
    name,
    amount,
    labelClaimMg: milligramsFromDoseLabel(amount),
    casNumber: casNumber ?? chemistryCas(name),
  }
}

/**
 * Component list for a variant's COA editor / pack. Known blends (including
 * named trade blends) win; otherwise parse "A and B" / "A / B" product names.
 */
export function blendComponentsForCoa(
  productName: string,
  dose: string | null | undefined
): CoaBlendPart[] | null {
  const fromKnown = resolveBlendCompounds(productName, dose ?? null)
  if (fromKnown && fromKnown.length >= 2) {
    return fromKnown.map((c) => toPart(c.name, c.amount || '', c.casNumber))
  }
  const parsed = parseBlendProduct(productName, dose ?? '')
  if (!parsed || parsed.length < 2) return null
  return parsed.map((c) => toPart(c.name, c.amount))
}

export function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function coverBlendComponents<T extends { compoundName: string }>(
  parts: CoaBlendPart[],
  coas: T[]
): BlendCoverage<T> {
  const used = new Set<number>()
  const matched: CoaBlendMatch<T>[] = []
  const missing: CoaBlendPart[] = []

  for (const part of parts) {
    const idx = coas.findIndex((c, i) => !used.has(i) && namesMatch(c.compoundName, part.name))
    if (idx === -1) {
      missing.push(part)
      continue
    }
    used.add(idx)
    matched.push({ part, coa: coas[idx] })
  }

  const extra = coas.filter((_, i) => !used.has(i))
  return { matched, missing, extra }
}

export function prefillFromBlendPart(part: CoaBlendPart): {
  compoundName: string
  doseLabel: string
  assayLabelClaimMg: string
  identitySpec: string
  identityResult: string
  casNumber: string
} {
  return {
    compoundName: part.name,
    doseLabel: part.amount,
    assayLabelClaimMg: part.labelClaimMg != null ? String(part.labelClaimMg) : '',
    identitySpec: part.name,
    identityResult: part.name,
    casNumber: part.casNumber ?? '',
  }
}

function num(n: number, dp: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: 0 })
}

/** Header subtitle: "Of Ipamorelin 5 mg claim · 5.93 mg". */
export function assayClaimCaption(input: {
  compoundName: string
  measuredMg: number
  labelClaimMg: number
}): string {
  const name = input.compoundName.trim()
  return `Of ${name} ${num(input.labelClaimMg, 2)} mg claim · ${num(input.measuredMg, 2)} mg`
}

export function blendBanner(input: {
  productName: string
  dose: string | null | undefined
  parts: CoaBlendPart[]
  thisCompound: string
}): string {
  const dose = input.dose?.trim() ? ` · ${input.dose.trim()}` : ''
  return `Component of ${input.productName}${dose} — this page: ${input.thisCompound}`
}

export interface OrderCoaLineInput<T extends { id: string; compoundName: string }> {
  productName: string
  dose: string | null | undefined
  quantity: number
  coas: T[]
}

export interface OrderCoaPack<T extends { id: string; compoundName: string }> {
  pages: T[]
  pageCount: number
  warnings: string[]
}

/** Flatten an order's certificates into print order (blend components first). */
export function planOrderCoaPack<T extends { id: string; compoundName: string }>(
  lines: OrderCoaLineInput<T>[]
): OrderCoaPack<T> {
  const pages: T[] = []
  const warnings: string[] = []

  for (const line of lines) {
    const parts = blendComponentsForCoa(line.productName, line.dose)
    if (parts) {
      const coverage = coverBlendComponents(parts, line.coas)
      for (const m of coverage.matched) pages.push(m.coa)
      pages.push(...coverage.extra)
      if (coverage.missing.length > 0) {
        const names = coverage.missing.map((p) => p.name).join(', ')
        warnings.push(`${line.productName}: no certificate for ${names}`)
      }
      if (line.coas.length === 0) {
        warnings.push(`${line.productName}: no published COA on file`)
      }
      continue
    }
    if (line.coas.length === 0) {
      warnings.push(`${line.productName}: no published COA on file`)
      continue
    }
    pages.push(...line.coas)
  }

  return { pages, pageCount: pages.length, warnings }
}

/** Presentational context passed into the certificate renderer for blend vials. */
export interface CoaBlendContext {
  productName: string
  dose: string | null
  parts: CoaBlendPart[]
  thisCompound: string
  banner: string
}

export function blendContextFor(
  productName: string,
  dose: string | null | undefined,
  thisCompound: string
): CoaBlendContext | null {
  const parts = blendComponentsForCoa(productName, dose)
  if (!parts) return null
  return {
    productName,
    dose: dose ?? null,
    parts,
    thisCompound,
    banner: blendBanner({ productName, dose, parts, thisCompound }),
  }
}
