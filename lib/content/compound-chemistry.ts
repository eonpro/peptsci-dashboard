/**
 * Verified single-compound chemistry for shop catalog cards / PDP specs.
 *
 * Used as a fallback when Product.casNumber / molecularFormula / molecularWeight
 * are null in Postgres (common for UI-created SKUs and post-import gaps).
 * Values are PubChem / primary-datasheet verified — never invent constants.
 *
 * Blends have no single CAS/MW; see blend-compositions.ts instead.
 *
 * Keyed by normalizeKey (same as peptide-monographs). Add a compound by
 * appending an entry; aliases cover catalog naming variants.
 */
import { normalizeKey } from './peptide-monographs'

export interface CompoundChemistry {
  casNumber?: string
  molecularFormula?: string
  /** Numeric g/mol (catalog formats the display string). */
  molecularWeight?: number
  pubchemCid?: string
  purity?: string
  /** Optional scientific category when Product.category is null. */
  category?: string
}

const P = '99%'

/**
 * Master chemistry table. Prefer free-base / cation values as shown on
 * research catalogs (not salt adduct masses) unless noted.
 */
export const COMPOUND_CHEMISTRY: Record<string, CompoundChemistry> = {
  // --- Screenshot empties / high-priority gaps (2026-08 research) ---
  '5-amino-1mq': {
    casNumber: '42464-96-0',
    molecularFormula: 'C10H11N2+',
    molecularWeight: 159.21,
    pubchemCid: '950107',
    purity: P,
    category: 'NNMT inhibitor (small molecule)',
  },
  'aod-9604': {
    casNumber: '221231-10-3',
    molecularFormula: 'C78H123N23O23S2',
    molecularWeight: 1815.1,
    pubchemCid: '71300630',
    purity: P,
    category: 'hGH fragment analog',
  },
  dsip: {
    casNumber: '62568-57-4',
    molecularFormula: 'C35H48N10O15',
    molecularWeight: 848.8,
    pubchemCid: '68816',
    purity: P,
    category: 'Neuropeptide',
  },
  kisspeptin: {
    casNumber: '374675-21-5',
    molecularFormula: 'C63H83N17O14',
    molecularWeight: 1302.4,
    pubchemCid: '25240297',
    purity: P,
    category: 'Kisspeptin receptor agonist',
  },
  'thymosin-alpha-1': {
    casNumber: '62304-98-7',
    molecularFormula: 'C129H215N33O55',
    molecularWeight: 3108.3,
    pubchemCid: '16130571',
    purity: P,
    category: 'Immunomodulatory peptide',
  },
  sermorelin: {
    casNumber: '86168-78-7',
    molecularFormula: 'C149H246N44O42S',
    molecularWeight: 3357.9,
    pubchemCid: '16132413',
    purity: P,
    category: 'GHRH (1-29) analog',
  },
  ipamorelin: {
    casNumber: '170851-70-4',
    molecularFormula: 'C38H49N9O5',
    molecularWeight: 711.9,
    pubchemCid: '9831659',
    purity: P,
    category: 'Growth hormone secretagogue',
  },

  // --- Core catalog (Jul 2026 PubChem-verified set + seed) ---
  'bpc-157': {
    casNumber: '137525-51-0',
    molecularFormula: 'C62H98N16O22',
    molecularWeight: 1419.5,
    pubchemCid: '9941957',
    purity: P,
  },
  'tb-500': {
    casNumber: '77591-33-4',
    molecularFormula: 'C212H350N56O78S',
    molecularWeight: 4963.44,
    pubchemCid: '16132341',
    purity: P,
  },
  'ghk-cu': {
    casNumber: '89030-95-5',
    molecularFormula: 'C14H22CuN6O4',
    molecularWeight: 401.9,
    purity: P,
  },
  'll-37': {
    casNumber: '221395-65-1',
    molecularFormula: 'C205H340N60O53',
    molecularWeight: 4493.34,
    pubchemCid: '16198951',
    purity: P,
  },
  'cjc-1295': {
    casNumber: '863288-34-0',
    molecularFormula: 'C152H252N44O42',
    molecularWeight: 3367.9,
    pubchemCid: '56841945',
    purity: P,
    category: 'GHRH analog (no DAC / Mod GRF 1-29)',
  },
  'cjc-1295-with-dac': {
    casNumber: '863288-34-0',
    molecularFormula: 'C165H269N47O46',
    molecularWeight: 3647.19,
    pubchemCid: '91971820',
    purity: P,
    category: 'GHRH analog with DAC',
  },
  'ghrp-2': {
    casNumber: '158861-67-7',
    molecularFormula: 'C45H55N9O6',
    molecularWeight: 817.99,
    pubchemCid: '6918245',
    purity: P,
  },
  'ghrp-6': {
    casNumber: '87616-84-0',
    molecularFormula: 'C46H56N12O6',
    molecularWeight: 873.0,
    pubchemCid: '9919153',
    purity: P,
  },
  hexarelin: {
    casNumber: '140703-51-1',
    molecularFormula: 'C47H58N12O6',
    molecularWeight: 887.04,
    pubchemCid: '6918297',
    purity: P,
  },
  kpv: {
    casNumber: '67727-97-3',
    molecularFormula: 'C16H30N4O4',
    molecularWeight: 342.43,
    pubchemCid: '125672',
    purity: P,
  },
  epitalon: {
    casNumber: '307297-39-8',
    molecularFormula: 'C14H22N4O9',
    molecularWeight: 390.35,
    pubchemCid: '219042',
    purity: P,
  },
  glutathione: {
    casNumber: '70-18-8',
    molecularFormula: 'C10H17N3O6S',
    molecularWeight: 307.32,
    pubchemCid: '124886',
    purity: P,
  },
  alprostadil: {
    casNumber: '745-65-3',
    molecularFormula: 'C20H34O5',
    molecularWeight: 354.5,
    pubchemCid: '5280723',
    purity: P,
  },
  tesamorelin: {
    casNumber: '218949-48-5',
    molecularFormula: 'C221H366N72O67S',
    molecularWeight: 5135.9,
    pubchemCid: '16137828',
    purity: P,
    category: 'GHRH analog',
  },
  semaglutide: {
    casNumber: '910463-68-2',
    molecularFormula: 'C187H291N45O59',
    molecularWeight: 4113.58,
    pubchemCid: '56843331',
    purity: P,
  },
  tirzepatide: {
    casNumber: '2023788-19-2',
    molecularFormula: 'C225H348N48O68',
    molecularWeight: 4813.45,
    pubchemCid: '166567236',
    purity: P,
  },
  retatrutide: {
    casNumber: '2381089-83-2',
    molecularFormula: 'C221H342N46O68',
    molecularWeight: 4731.33,
    pubchemCid: '171390338',
    purity: P,
  },
  mazdutide: {
    casNumber: '2259884-03-0',
    molecularFormula: 'C207H317N45O65',
    molecularWeight: 4476,
    pubchemCid: '167312357',
    purity: P,
  },
  cagrilintide: {
    casNumber: '1415456-99-3',
    molecularFormula: 'C194H312N54O59S2',
    molecularWeight: 4409,
    pubchemCid: '171397054',
    purity: P,
  },
  'mots-c': {
    casNumber: '1627580-64-6',
    molecularFormula: 'C101H152N28O22S2',
    molecularWeight: 2174.6,
    pubchemCid: '146675088',
    purity: P,
  },
  selank: {
    casNumber: '129954-34-3',
    molecularFormula: 'C33H57N11O9',
    molecularWeight: 751.9,
    pubchemCid: '11765600',
    purity: P,
  },
  semax: {
    casNumber: '80714-61-0',
    molecularFormula: 'C37H51N9O10S',
    molecularWeight: 813.93,
    pubchemCid: '9811102',
    purity: P,
  },
  'pt-141': {
    casNumber: '189691-06-3',
    molecularFormula: 'C50H68N14O10',
    molecularWeight: 1025.16,
    pubchemCid: '9941379',
    purity: P,
  },
  'melanotan-ii': {
    casNumber: '121062-08-6',
    molecularFormula: 'C50H69N15O9',
    molecularWeight: 1024.18,
    pubchemCid: '92432',
    purity: P,
  },
  'ss-31': {
    casNumber: '736992-21-5',
    molecularFormula: 'C32H49N9O5',
    molecularWeight: 639.79,
    pubchemCid: '11764719',
    purity: P,
  },
  'snap-8': {
    casNumber: '868844-74-0',
    molecularFormula: 'C41H70N16O16S',
    molecularWeight: 1075.16,
    pubchemCid: '71587832',
    purity: P,
  },
  'nad-plus': {
    casNumber: '53-84-9',
    molecularFormula: 'C21H27N7O14P2',
    molecularWeight: 663.43,
    pubchemCid: '5892',
    purity: P,
  },
  oxytocin: {
    casNumber: '50-56-6',
    molecularFormula: 'C43H66N12O12S2',
    molecularWeight: 1007.19,
    pubchemCid: '439302',
    purity: P,
  },
  // Do NOT resolve IGF-1 LR3 via CAS→PubChem (false ~1332 g/mol hit).
  'igf-1lr3': {
    casNumber: '946870-92-4',
    molecularFormula: 'C400H625N111O115S9',
    molecularWeight: 9117.6,
    purity: P,
    category: 'Muscle growth',
  },
  'foxo4-dri': {
    molecularFormula: 'C228H388N86O64',
    molecularWeight: 5358.05,
    pubchemCid: '167312269',
    purity: P,
  },
  'slu-pp-332': {
    casNumber: '303760-60-3',
    molecularFormula: 'C18H14N2O2',
    molecularWeight: 290.32,
    pubchemCid: '5404083',
    purity: P,
  },
  hgh: {
    casNumber: '12629-01-5',
    molecularFormula: 'C990H1529N263O299S7',
    molecularWeight: 22124.12,
    purity: P,
    category: 'Growth hormone',
  },
  'fragment-176-191': {
    casNumber: '221231-10-3',
    molecularFormula: 'C78H123N23O23S2',
    molecularWeight: 1815.1,
    pubchemCid: '71300630',
    purity: P,
  },

  // --- Crest / extended catalog ---
  'ara-290': {
    casNumber: '1208243-50-8',
    molecularFormula: 'C51H84N16O21',
    molecularWeight: 1257.3,
    pubchemCid: '91810664',
    purity: P,
  },
  pinealon: {
    casNumber: '175175-23-2',
    molecularFormula: 'C15H26N6O8',
    molecularWeight: 418.4,
    pubchemCid: '10273502',
    purity: P,
  },
  vip: {
    casNumber: '37221-79-7',
    molecularFormula: 'C147H237N43O43S',
    molecularWeight: 3326.8,
    pubchemCid: '53314964',
    purity: P,
  },
  survodutide: {
    casNumber: '2805997-46-8',
    molecularFormula: 'C192H289N47O61',
    molecularWeight: 4232,
    pubchemCid: '171378821',
    purity: P,
  },
  'melanotan-i': {
    casNumber: '75921-69-6',
    molecularFormula: 'C78H111N21O19',
    molecularWeight: 1646.8,
    pubchemCid: '16197727',
    purity: P,
  },
  // Formula varies slightly across secondary sources; CAS + ~MW are solid.
  'igf-des': {
    casNumber: '112603-35-7',
    molecularFormula: 'C319H501N91O96S7',
    molecularWeight: 7371.4,
    purity: P,
  },
}

const ALIASES: Record<string, string> = {
  '5-amino-1-mq': '5-amino-1mq',
  '5amino1mq': '5-amino-1mq',
  '5-amino-1-methylquinolinium': '5-amino-1mq',
  aod9604: 'aod-9604',
  'aod-9604-fragment': 'aod-9604',
  'kisspeptin-10': 'kisspeptin',
  kisspeptin10: 'kisspeptin',
  metastin: 'kisspeptin',
  'thymosin-alpha1': 'thymosin-alpha-1',
  thymalfasin: 'thymosin-alpha-1',
  ta1: 'thymosin-alpha-1',
  'sermorelin-acetate': 'sermorelin',
  'ipamorelin-acetate': 'ipamorelin',
  bpc157: 'bpc-157',
  tb500: 'tb-500',
  'thymosin-beta-4': 'tb-500',
  ghkcu: 'ghk-cu',
  'copper-tripeptide-1': 'ghk-cu',
  ll37: 'll-37',
  cjc1295: 'cjc-1295',
  'cjc-1295-without-dac': 'cjc-1295',
  'cjc-1295-no-dac': 'cjc-1295',
  'mod-grf-1-29': 'cjc-1295',
  'cjc-1295-dac': 'cjc-1295-with-dac',
  'cjc-1295-with-dac-form': 'cjc-1295-with-dac',
  ghrp2: 'ghrp-2',
  'ghrp-2-acetate': 'ghrp-2',
  ghrp6: 'ghrp-6',
  'ghrp-6-acetate': 'ghrp-6',
  'hexarelin-acetate': 'hexarelin',
  examorelin: 'hexarelin',
  epithalon: 'epitalon',
  egrifta: 'tesamorelin',
  igf1lr3: 'igf-1lr3',
  'igf-1-lr3': 'igf-1lr3',
  'igf-1-long-r3': 'igf-1lr3',
  foxo4: 'foxo4-dri',
  'slu-pp332': 'slu-pp-332',
  slupp332: 'slu-pp-332',
  somatropin: 'hgh',
  'human-growth-hormone': 'hgh',
  'hgh-191aa': 'hgh',
  'fragment-176-191-hgh': 'fragment-176-191',
  'hgh-frag-176-191': 'fragment-176-191',
  'hgh-fragment-176-191': 'fragment-176-191',
  ara290: 'ara-290',
  cibinetide: 'ara-290',
  'ara-290-cibinetide': 'ara-290',
  nad: 'nad-plus',
  'nad-': 'nad-plus',
  'oxytocin-acetate': 'oxytocin',
  pt141: 'pt-141',
  bremelanotide: 'pt-141',
  'melanotan-2': 'melanotan-ii',
  melanotan2: 'melanotan-ii',
  mt2: 'melanotan-ii',
  'mt-2': 'melanotan-ii',
  'mt-2-melanotan-ii-acetate': 'melanotan-ii',
  'melanotan-1': 'melanotan-i',
  melanotan1: 'melanotan-i',
  mt1: 'melanotan-i',
  'mt-1': 'melanotan-i',
  afamelanotide: 'melanotan-i',
  ss31: 'ss-31',
  elamipretide: 'ss-31',
  snap8: 'snap-8',
  'igf-1-des': 'igf-des',
  'des-1-3-igf-1': 'igf-des',
  'des-igf-1': 'igf-des',
  motsc: 'mots-c',
}

function resolveKey(name: string): string | null {
  if (!name) return null
  const key = normalizeKey(name)
  if (COMPOUND_CHEMISTRY[key]) return key
  const alias = ALIASES[key]
  if (alias && COMPOUND_CHEMISTRY[alias]) return alias
  return null
}

/** Look up verified chemistry by product name, or null when unknown / mixture. */
export function getCompoundChemistry(name: string): CompoundChemistry | null {
  const key = resolveKey(name)
  if (!key) return null
  return COMPOUND_CHEMISTRY[key] ?? null
}
