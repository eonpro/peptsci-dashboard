/**
 * Component breakdown for multi-peptide blend products.
 *
 * Blends have no single CAS number or molecular weight, so the product detail
 * page instead shows each component compound with its own verified chemical
 * identity (via the multi-compound ProductDetailCard layout). Values are the
 * same verified figures used across the catalog (PubChem / primary datasheets).
 *
 * Keyed by a normalized product name (see `normalizeKey` in
 * ./peptide-monographs). Add a blend by appending an entry.
 */
import { normalizeKey } from './peptide-monographs'

export interface BlendComponent {
  name: string
  casNumber?: string
  molecularFormula?: string
  /** g/mol, formatted for display. */
  molecularWeight?: string
  purity?: string
}

const P = '99%'

// Verified component chemistry (shared building blocks).
const GHK_CU: BlendComponent = { name: 'GHK-Cu', casNumber: '89030-95-5', molecularFormula: 'C14H22CuN6O4', molecularWeight: '401.9 g/mol', purity: P }
const BPC_157: BlendComponent = { name: 'BPC-157', casNumber: '137525-51-0', molecularFormula: 'C62H98N16O22', molecularWeight: '1419.5 g/mol', purity: P }
const TB_500: BlendComponent = { name: 'TB-500', casNumber: '77591-33-4', molecularFormula: 'C212H350N56O78S', molecularWeight: '4963.44 g/mol', purity: P }
const KPV: BlendComponent = { name: 'KPV', casNumber: '67727-97-3', molecularFormula: 'C16H30N4O4', molecularWeight: '342.43 g/mol', purity: P }
const CJC_1295_NO_DAC: BlendComponent = { name: 'CJC-1295 (no DAC)', casNumber: '863288-34-0', molecularFormula: 'C152H252N44O42', molecularWeight: '3367.9 g/mol', purity: P }
const IPAMORELIN: BlendComponent = { name: 'Ipamorelin', casNumber: '170851-70-4', molecularFormula: 'C38H49N9O5', molecularWeight: '711.9 g/mol', purity: P }

// Component order matches the printed label artwork (BPC-157 / TB-500 first,
// then GHK-Cu, then KPV) so per-component doses parsed from the variant dose
// string line up positionally.
export const BLEND_COMPOSITIONS: Record<string, BlendComponent[]> = {
  'bpc-157-tb-500-blend': [BPC_157, TB_500],
  glow: [BPC_157, TB_500, GHK_CU],
  klow: [BPC_157, TB_500, GHK_CU, KPV],
  'cjc-1295-no-dac-ipamorelin': [CJC_1295_NO_DAC, IPAMORELIN],
}

const ALIASES: Record<string, string> = {
  'cjc-1295-ipamorelin': 'cjc-1295-no-dac-ipamorelin',
  'cjc-1295-no-dac-ipamorelin-blend': 'cjc-1295-no-dac-ipamorelin',
  // Marketing names carry the total-mg suffix ("Glow 70", "Klow 80").
  'glow-70': 'glow',
  'klow-80': 'klow',
  'glow-blend': 'glow',
  'klow-blend': 'klow',
}

/** Resolve a blend's component list by product name, or null if not a known blend. */
export function getBlendComposition(name: string): BlendComponent[] | null {
  if (!name) return null
  const key = normalizeKey(name)
  if (BLEND_COMPOSITIONS[key]) return BLEND_COMPOSITIONS[key]
  const alias = ALIASES[key]
  if (alias && BLEND_COMPOSITIONS[alias]) return BLEND_COMPOSITIONS[alias]
  // "CJC-1295 (no DAC) + Ipamorelin" style names.
  if (key.includes('cjc-1295') && key.includes('ipamorelin')) {
    return BLEND_COMPOSITIONS['cjc-1295-no-dac-ipamorelin']
  }
  return null
}
