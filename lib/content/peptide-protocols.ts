/**
 * Commonly cited research-protocol references for reconstitution + dosing
 * literacy on the shop PDP calculator.
 *
 * Editorial rules (aligned with monographs / RUO posture):
 *  - Framed as published/research-protocol ranges — NOT medical advice.
 *  - No therapeutic-efficacy claims.
 *  - Always paired with the RUO disclaimer in the UI.
 *
 * Keyed by the same normalized names as `peptide-monographs.ts`.
 */
import { normalizeKey } from './peptide-monographs'

export type ProtocolDoseLine = {
  /** Short range, e.g. "250–500 mcg". */
  range: string
  /** Frequency / schedule note. */
  schedule: string
}

export type PeptideProtocol = {
  /** Suggested bacteriostatic water volume for the typical vial size. */
  recommendedBacWaterMl: number
  /** Calculator default for desired dose (mcg). */
  defaultDoseMcg: number
  /** Typical vial mass this protocol assumes (mg); UI still uses live SKU. */
  typicalVialMg?: number
  reconstitutionNote?: string
  daily: ProtocolDoseLine
  weekly: ProtocolDoseLine
}

const PROTOCOLS: Record<string, PeptideProtocol> = {
  'bpc-157': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 250,
    typicalVialMg: 5,
    reconstitutionNote: 'Common research protocols reconstitute with 1–2 ml bacteriostatic water.',
    daily: { range: '250–500 mcg', schedule: 'Once or twice daily (research protocols)' },
    weekly: { range: '1.75–3.5 mg', schedule: 'Cumulative at daily research dosing' },
  },
  'tb-500': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 500,
    typicalVialMg: 5,
    reconstitutionNote: 'Often reconstituted with 2 ml bacteriostatic water for unit readability.',
    daily: { range: '500–1,000 mcg', schedule: 'Daily during loading (research protocols)' },
    weekly: { range: '2–5 mg', schedule: '2–3× weekly maintenance in many protocols' },
  },
  'bpc-157-tb-500-blend': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 250,
    typicalVialMg: 10,
    reconstitutionNote:
      'For a 10 mg total blend vial, 2.0 ml BAC water yields 5.0 mg/ml (crestpep-style math).',
    daily: { range: '250–500 mcg total', schedule: 'Once daily subcutaneous (research protocols)' },
    weekly: { range: '1.75–3.5 mg total', schedule: 'Cumulative at daily research dosing' },
  },
  'ghk-cu': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 500,
    typicalVialMg: 50,
    daily: { range: '500–1,000 mcg', schedule: 'Once daily (research protocols)' },
    weekly: { range: '3.5–7 mg', schedule: 'Cumulative at daily research dosing' },
  },
  'll-37': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 100,
    typicalVialMg: 5,
    daily: { range: '50–100 mcg', schedule: 'Once daily (research protocols)' },
    weekly: { range: '350–700 mcg', schedule: 'Cumulative at daily research dosing' },
  },
  'aod-9604': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 300,
    typicalVialMg: 5,
    daily: { range: '300–500 mcg', schedule: 'Once daily (research protocols)' },
    weekly: { range: '2.1–3.5 mg', schedule: 'Cumulative at daily research dosing' },
  },
  'cjc-1295': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 100,
    typicalVialMg: 5,
    daily: { range: '100–300 mcg', schedule: '1–2× daily (no-DAC research protocols)' },
    weekly: { range: '1–2 mg', schedule: 'Or 1–2× weekly for DAC forms in research literature' },
  },
  ipamorelin: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 200,
    typicalVialMg: 5,
    daily: { range: '200–300 mcg', schedule: '1–3× daily (research protocols)' },
    weekly: { range: '1.4–6.3 mg', schedule: 'Cumulative depending on injections/day' },
  },
  'cjc-1295-ipamorelin-blend': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 200,
    typicalVialMg: 10,
    daily: { range: '200–300 mcg total', schedule: '1–2× daily (research protocols)' },
    weekly: { range: '1.4–4.2 mg total', schedule: 'Cumulative at research dosing' },
  },
  'ghrp-2': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 100,
    typicalVialMg: 5,
    daily: { range: '100–300 mcg', schedule: '1–3× daily (research protocols)' },
    weekly: { range: '0.7–6.3 mg', schedule: 'Cumulative depending on injections/day' },
  },
  'ghrp-6': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 100,
    typicalVialMg: 5,
    daily: { range: '100–300 mcg', schedule: '1–3× daily (research protocols)' },
    weekly: { range: '0.7–6.3 mg', schedule: 'Cumulative depending on injections/day' },
  },
  hexarelin: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 100,
    typicalVialMg: 2,
    daily: { range: '100–200 mcg', schedule: '1–3× daily (research protocols)' },
    weekly: { range: '0.7–4.2 mg', schedule: 'Cumulative depending on injections/day' },
  },
  sermorelin: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 200,
    typicalVialMg: 5,
    daily: { range: '200–500 mcg', schedule: 'Once daily at bedtime (research protocols)' },
    weekly: { range: '1.4–3.5 mg', schedule: 'Cumulative at daily research dosing' },
  },
  tesamorelin: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 1000,
    typicalVialMg: 10,
    daily: { range: '1–2 mg', schedule: 'Once daily (label / research reference)' },
    weekly: { range: '7–14 mg', schedule: 'Cumulative at daily reference dosing' },
  },
  'tesamorelin-ipamorelin-blend': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 500,
    typicalVialMg: 15,
    daily: { range: '500–1,000 mcg total', schedule: 'Once daily (research protocols)' },
    weekly: { range: '3.5–7 mg total', schedule: 'Cumulative at daily research dosing' },
  },
  dihexa: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 5,
    typicalVialMg: 5,
    daily: { range: '5–20 mcg', schedule: 'Once daily (preclinical research protocols)' },
    weekly: { range: '35–140 mcg', schedule: 'Cumulative at daily research dosing' },
  },
  dsip: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 100,
    typicalVialMg: 5,
    daily: { range: '100–300 mcg', schedule: 'Once daily at bedtime (research protocols)' },
    weekly: { range: '0.7–2.1 mg', schedule: 'Cumulative at daily research dosing' },
  },
  epitalon: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 5,
    typicalVialMg: 10,
    daily: { range: '5–10 mg', schedule: 'Once daily in short research cycles' },
    weekly: { range: '35–70 mg', schedule: 'During active research cycle weeks' },
  },
  'foxo4-dri': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 1000,
    typicalVialMg: 10,
    daily: { range: 'Protocol-dependent', schedule: 'Preclinical only — consult published models' },
    weekly: { range: 'Protocol-dependent', schedule: 'Not standardized in human literature' },
  },
  'fragment-176-191': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 250,
    typicalVialMg: 5,
    daily: { range: '250–500 mcg', schedule: '1–2× daily (research protocols)' },
    weekly: { range: '1.75–7 mg', schedule: 'Cumulative at research dosing' },
  },
  'melanotan-ii': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 250,
    typicalVialMg: 10,
    daily: { range: '250–500 mcg', schedule: 'Once daily during loading (research protocols)' },
    weekly: { range: '0.5–1 mg', schedule: '1–2× weekly maintenance in many protocols' },
  },
  'mots-c': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 5000,
    typicalVialMg: 10,
    daily: { range: '5–10 mg', schedule: '3–5× weekly (research protocols)' },
    weekly: { range: '15–50 mg', schedule: 'Depending on research schedule' },
  },
  'pt-141': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 1000,
    typicalVialMg: 10,
    daily: { range: '0.5–2 mg', schedule: 'As-needed research protocols (not daily)' },
    weekly: { range: '1–4 mg', schedule: '1–2 research uses per week typical' },
  },
  selank: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 250,
    typicalVialMg: 5,
    daily: { range: '250–500 mcg', schedule: '1–2× daily (research protocols)' },
    weekly: { range: '1.75–7 mg', schedule: 'Cumulative at research dosing' },
  },
  semax: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 300,
    typicalVialMg: 5,
    daily: { range: '200–600 mcg', schedule: '1–2× daily (research protocols)' },
    weekly: { range: '1.4–8.4 mg', schedule: 'Cumulative at research dosing' },
  },
  'thymosin-alpha-1': {
    recommendedBacWaterMl: 1,
    defaultDoseMcg: 1600,
    typicalVialMg: 5,
    daily: { range: '0.8–1.6 mg', schedule: '2× weekly common; some daily research protocols' },
    weekly: { range: '1.6–3.2 mg', schedule: 'Twice-weekly research schedules' },
  },
  semaglutide: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 250,
    typicalVialMg: 5,
    reconstitutionNote: 'GLP-1 research vials — follow labeled titration schedules when applicable.',
    daily: { range: 'N/A', schedule: 'Typically once weekly — not a daily peptide' },
    weekly: { range: '0.25–2.4 mg', schedule: 'Once weekly (label titration reference)' },
  },
  tirzepatide: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 2500,
    typicalVialMg: 10,
    reconstitutionNote: 'Dual GIP/GLP-1 research vials — follow labeled titration when applicable.',
    daily: { range: 'N/A', schedule: 'Typically once weekly — not a daily peptide' },
    weekly: { range: '2.5–15 mg', schedule: 'Once weekly (label titration reference)' },
  },
  retatrutide: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 1000,
    typicalVialMg: 10,
    daily: { range: 'N/A', schedule: 'Typically once weekly in research protocols' },
    weekly: { range: '1–12 mg', schedule: 'Once weekly titration (research literature)' },
  },
  'nad-plus': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 100000,
    typicalVialMg: 500,
    daily: { range: '50–100 mg', schedule: 'Protocol-dependent (research / clinic reference)' },
    weekly: { range: '100–500 mg', schedule: 'Depending on infusion / research schedule' },
  },
  glutathione: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 200000,
    typicalVialMg: 600,
    daily: { range: '200–600 mg', schedule: 'Protocol-dependent (research / clinic reference)' },
    weekly: { range: '600–1,800 mg', schedule: 'Depending on research schedule' },
  },
  hcg: {
    recommendedBacWaterMl: 1,
    defaultDoseMcg: 250,
    typicalVialMg: 5000,
    reconstitutionNote: 'hCG is often labeled in IU; convert carefully before calculating units.',
    daily: { range: '250–500 IU', schedule: 'Protocol-dependent (label / clinician reference)' },
    weekly: { range: '750–5,000 IU', schedule: 'Depending on research or labeled schedule' },
  },
  hgh: {
    recommendedBacWaterMl: 1,
    defaultDoseMcg: 1000,
    typicalVialMg: 10,
    daily: { range: '1–2 IU', schedule: 'Once daily (clinician / research reference only)' },
    weekly: { range: '7–14 IU', schedule: 'Cumulative at daily reference dosing' },
  },
  'igf-1lr3': {
    recommendedBacWaterMl: 1,
    defaultDoseMcg: 50,
    typicalVialMg: 1,
    daily: { range: '20–50 mcg', schedule: 'Once daily (research protocols)' },
    weekly: { range: '140–350 mcg', schedule: 'Cumulative at daily research dosing' },
  },
  kpv: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 200,
    typicalVialMg: 5,
    daily: { range: '200–500 mcg', schedule: 'Once or twice daily (research protocols)' },
    weekly: { range: '1.4–3.5 mg', schedule: 'Cumulative at daily research dosing' },
  },
  oxytocin: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 10,
    typicalVialMg: 5,
    daily: { range: 'Protocol-dependent', schedule: 'Label / clinician reference only' },
    weekly: { range: 'Protocol-dependent', schedule: 'Not a standard weekly peptide schedule' },
  },
  'slu-pp-332': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 100,
    typicalVialMg: 5,
    daily: { range: 'Protocol-dependent', schedule: 'Early research — consult published models' },
    weekly: { range: 'Protocol-dependent', schedule: 'Not standardized' },
  },
  'snap-8': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 100,
    typicalVialMg: 10,
    daily: { range: 'Topical / protocol-dependent', schedule: 'Often topical research use' },
    weekly: { range: 'Protocol-dependent', schedule: 'Follow published cosmetic research protocols' },
  },
  'ss-31': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 5,
    typicalVialMg: 10,
    daily: { range: '5–10 mg', schedule: 'Once daily (research protocols)' },
    weekly: { range: '35–70 mg', schedule: 'Cumulative at daily research dosing' },
  },
  '5-amino-1mq': {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 50000,
    typicalVialMg: 50,
    daily: { range: '50–150 mg', schedule: 'Once daily oral research protocols (not injectable)' },
    weekly: { range: '350–1,050 mg', schedule: 'Cumulative at daily research dosing' },
  },
  glow: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 500,
    typicalVialMg: 70,
    reconstitutionNote: 'GHK-Cu + BPC-157 + TB-500 blend — dose refers to total peptide mass.',
    daily: { range: '500–1,000 mcg total', schedule: 'Once daily (research protocols)' },
    weekly: { range: '3.5–7 mg total', schedule: 'Cumulative at daily research dosing' },
  },
  klow: {
    recommendedBacWaterMl: 2,
    defaultDoseMcg: 500,
    typicalVialMg: 80,
    reconstitutionNote: 'GHK-Cu + BPC-157 + TB-500 + KPV blend — dose refers to total peptide mass.',
    daily: { range: '500–1,000 mcg total', schedule: 'Once daily (research protocols)' },
    weekly: { range: '3.5–7 mg total', schedule: 'Cumulative at daily research dosing' },
  },
}

/** Alias map mirrors monograph resolution for catalog name variants. */
const ALIASES: Record<string, string> = {
  bpc157: 'bpc-157',
  'body-protection-compound-157': 'bpc-157',
  tb500: 'tb-500',
  'thymosin-beta-4': 'tb-500',
  'thymosin-beta-4-fragment': 'tb-500',
  'copper-tripeptide-1': 'ghk-cu',
  ghkcu: 'ghk-cu',
  'cathelicidin-ll-37': 'll-37',
  ll37: 'll-37',
  aod9604: 'aod-9604',
  cjc1295: 'cjc-1295',
  'cjc-1295-without-dac': 'cjc-1295',
  'cjc-1295-dac': 'cjc-1295',
  'mod-grf-1-29': 'cjc-1295',
  ghrp2: 'ghrp-2',
  pralmorelin: 'ghrp-2',
  ghrp6: 'ghrp-6',
  examorelin: 'hexarelin',
  egrifta: 'tesamorelin',
  'hgh-fragment-176-191': 'fragment-176-191',
  'hgh-frag-176-191': 'fragment-176-191',
  'fragment-176-191-hgh': 'fragment-176-191',
  'kisspeptin-10': 'kisspeptin',
  'melanotan-2': 'melanotan-ii',
  melanotan2: 'melanotan-ii',
  'mt-ii': 'melanotan-ii',
  mt2: 'melanotan-ii',
  motsc: 'mots-c',
  pt141: 'pt-141',
  bremelanotide: 'pt-141',
  'thymosin-alpha1': 'thymosin-alpha-1',
  thymalfasin: 'thymosin-alpha-1',
  ta1: 'thymosin-alpha-1',
  ly3437943: 'retatrutide',
  nad: 'nad-plus',
  'nad-nasal-spray': 'nad-plus',
  'nad-plus-nasal-spray': 'nad-plus',
  'nicotinamide-adenine-dinucleotide': 'nad-plus',
  'l-glutathione': 'glutathione',
  'human-chorionic-gonadotropin': 'hcg',
  'chorionic-gonadotropin': 'hcg',
  pregnyl: 'hcg',
  'bpc-157-tb-500': 'bpc-157-tb-500-blend',
  'bpc-tb-blend': 'bpc-157-tb-500-blend',
  'glow-70': 'glow',
  'glow-blend': 'glow',
  'klow-80': 'klow',
  'klow-blend': 'klow',
  'cjc-1295-with-dac': 'cjc-1295',
  'cjc-1295-dac-form': 'cjc-1295',
  'cjc-1295-no-dac-ipamorelin': 'cjc-1295-ipamorelin-blend',
  'cjc-1295-ipamorelin': 'cjc-1295-ipamorelin-blend',
  epithalon: 'epitalon',
  foxo4: 'foxo4-dri',
  'ghrp-2-acetate': 'ghrp-2',
  'ghrp-6-acetate': 'ghrp-6',
  'hexarelin-acetate': 'hexarelin',
  igf1lr3: 'igf-1lr3',
  'igf-1-lr3': 'igf-1lr3',
  'lysine-proline-valine': 'kpv',
  'mt-2': 'melanotan-ii',
  'mt-2-melanotan-ii-acetate': 'melanotan-ii',
  'melanotan-ii-acetate': 'melanotan-ii',
  'oxytocin-acetate': 'oxytocin',
  'sermorelin-acetate': 'sermorelin',
  somatropin: 'hgh',
  'human-growth-hormone': 'hgh',
  '5-amino-1-mq': '5-amino-1mq',
  '5amino1mq': '5-amino-1mq',
  '5-amino-1-methylquinolinium': '5-amino-1mq',
  'tesamorelin-and-ipamorelin': 'tesamorelin-ipamorelin-blend',
  'tesamorelin-ipamorelin': 'tesamorelin-ipamorelin-blend',
  'tesamorelin-10mg-ipamorelin-5mg-blend': 'tesamorelin-ipamorelin-blend',
  'ghk-cu-and-bpc-157-and-tb-500': 'glow',
  'bpc-157-and-tb-500': 'bpc-157-tb-500-blend',
  'ghk-cu-and-bpc-157-and-tb-500-and-kpv': 'klow',
}

function resolveProtocolKey(name: string): string | null {
  const key = normalizeKey(name)
  if (PROTOCOLS[key]) return key
  const aliasKey = ALIASES[key] || ALIASES[key.replace(/-/g, '')]
  if (aliasKey && PROTOCOLS[aliasKey]) return aliasKey

  const hasGhk = key.includes('ghk')
  const hasBpc = key.includes('bpc-157') || key.includes('bpc157')
  const hasTb = key.includes('tb-500') || key.includes('tb500')
  const hasKpv = key.includes('kpv')
  if (hasGhk && hasBpc && hasTb && hasKpv) return 'klow'
  if (hasGhk && hasBpc && hasTb) return 'glow'
  if (hasBpc && hasTb) return 'bpc-157-tb-500-blend'
  if (
    (key.includes('tesamorelin') && key.includes('ipamorelin')) ||
    (key.includes('tesamorelin') && key.includes('ipa'))
  ) {
    return 'tesamorelin-ipamorelin-blend'
  }
  if (key.includes('cjc') && key.includes('ipamorelin')) return 'cjc-1295-ipamorelin-blend'
  return null
}

/** Look up research-protocol guidance for a catalog product name. */
export function getProtocolForName(name: string): PeptideProtocol | null {
  if (!name) return null
  const key = resolveProtocolKey(name)
  return key ? PROTOCOLS[key] ?? null : null
}

/** Generic defaults when no authored protocol exists for the SKU. */
export function getDefaultProtocol(vialMg: number): PeptideProtocol {
  const mg = vialMg > 0 ? vialMg : 10
  const defaultDoseMcg = Math.min(500, Math.max(50, Math.round((mg * 1000) / 40)))
  return {
    recommendedBacWaterMl: 2,
    defaultDoseMcg,
    typicalVialMg: mg,
    reconstitutionNote: 'Adjust bacteriostatic water to match your research protocol.',
    daily: {
      range: 'Protocol-dependent',
      schedule: 'Consult published research protocols for this compound',
    },
    weekly: {
      range: 'Protocol-dependent',
      schedule: 'Consult published research protocols for this compound',
    },
  }
}
