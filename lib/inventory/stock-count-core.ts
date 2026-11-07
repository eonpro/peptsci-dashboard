/**
 * Physical stock count — pure parsing, catalog matching and reconciliation
 * planning. No Prisma imports, so the Inventory dialog can share the types and
 * the service can unit-test every decision without a database.
 *
 * A count sets each listed variant's on-hand to the counted number AND moves
 * its batches to the same total. Fulfillment draws only from batches (FIFO by
 * BUD) and decrements on-hand with each draw, so units left outside a usable
 * batch can't get a vial label and never leave on-hand — the counter would
 * drift again after the first shipment.
 *
 * Matching never guesses: a size-less line for a multi-size product, two
 * catalog items with the same size, or two lines landing on one variant all
 * block the apply until the text names the size or SKU.
 *
 * A count is true at the moment it was taken. Stock recorded as moving after
 * that time (orders shipped, receipts, returns) is replayed on top of it, so a
 * shelf counted Thursday and entered Saturday doesn't resurrect Friday's
 * shipments.
 */

import { displayCatalogDose, displayProductName } from '../products/named-blends'
import { glpSearchAliases } from '../products/glp-trade-names'

export const STOCK_COUNT_MAX_TEXT = 50_000
export const STOCK_COUNT_MAX_LINES = 1_000
export const STOCK_COUNT_MAX_QTY = 1_000_000
/** Oldest count time accepted — replaying months of movements hides typos in the date. */
export const STOCK_COUNT_MAX_AGE_DAYS = 90
/** Clock skew tolerated between the browser and the server. */
const COUNT_TIME_SKEW_MS = 5 * 60 * 1000

/** Resolve the time a count was taken: empty → now; future or >90 days old → error. */
export function validateCountedAt(
  value: string | null | undefined,
  now: Date = new Date()
): { at: Date } | { error: string } {
  if (!value?.trim()) return { at: now }
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return { error: 'Count time is not a valid date.' }
  if (at.getTime() > now.getTime() + COUNT_TIME_SKEW_MS) {
    return { error: 'Count time cannot be in the future.' }
  }
  if (at.getTime() < now.getTime() - STOCK_COUNT_MAX_AGE_DAYS * 86_400_000) {
    return { error: `Count time must be within the last ${STOCK_COUNT_MAX_AGE_DAYS} days.` }
  }
  return { at }
}

// ── Parsing ──────────────────────────────────────────────────────────────

export interface StockCountEntry {
  /** 1-based position among all parsed entries. */
  index: number
  /** 1-based line of the pasted text the entry came from. */
  line: number
  /** Product as typed, e.g. "BPC-TB 10mg combo". */
  label: string
  qty: number
}

export interface StockCountParseIssue {
  line: number
  text: string
  message: string
}

// "<label> : <count> [vials]" — several may share one line. Labels may not
// contain the separators, so "NAD 500mg: 100 vials NAD 1000mg: 136" splits.
const ENTRY_RE =
  /([^:=\t\n]+?)[ \u00a0]*(?::|=|\t)[ \t\u00a0]*(\d[\d,]*(?:\.\d+)?)(?:[ \u00a0]*(?:vials?|units?|pcs|pieces|ea|x)\b\.?)?/gi

const HEADER_RE =
  /^\s*(product|item|name|sku|description)\b.*\b(count|qty|quantity|vials|on ?hand|units|stock)\s*$/i

function cleanLabel(raw: string): string {
  return raw
    .replace(/^[\s"'“”‘’•*·,;|>-]+/, '')
    .replace(/^\(?\d{1,3}[.)]\s+/, '')
    .replace(/[\s"'“”‘’•*·,;|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Split pasted text into count entries, reporting anything it can't read. */
export function parseStockCountText(text: string): {
  entries: StockCountEntry[]
  issues: StockCountParseIssue[]
} {
  const entries: StockCountEntry[] = []
  const issues: StockCountParseIssue[] = []
  if (text.length > STOCK_COUNT_MAX_TEXT) {
    issues.push({
      line: 0,
      text: '',
      message: `The pasted count is too long (max ${STOCK_COUNT_MAX_TEXT.toLocaleString('en-US')} characters).`,
    })
    return { entries, issues }
  }

  const lines = text.split(/\r\n|\n|\r/)
  lines.forEach((rawLine, i) => {
    const lineNo = i + 1
    const line = rawLine.trim()
    if (!/[a-z0-9]/i.test(line)) return
    if (HEADER_RE.test(line)) return

    let consumed = 0
    let found = 0
    for (const m of line.matchAll(ENTRY_RE)) {
      found += 1
      consumed = (m.index ?? 0) + m[0].length
      const label = cleanLabel(m[1])
      const rawQty = m[2].replace(/,/g, '')
      if (!label) {
        issues.push({
          line: lineNo,
          text: line,
          message: 'Missing the product name before the count.',
        })
        continue
      }
      if (rawQty.includes('.')) {
        issues.push({
          line: lineNo,
          text: line,
          message: `"${label}": counts must be whole numbers.`,
        })
        continue
      }
      const qty = Number(rawQty)
      if (!Number.isSafeInteger(qty) || qty > STOCK_COUNT_MAX_QTY) {
        issues.push({
          line: lineNo,
          text: line,
          message: `"${label}": ${m[2]} is not a valid count.`,
        })
        continue
      }
      entries.push({ index: entries.length + 1, line: lineNo, label, qty })
    }

    if (found === 0) {
      issues.push({
        line: lineNo,
        text: line,
        message: 'No count found — write it as "Product: count".',
      })
      return
    }
    const leftover = cleanLabel(line.slice(consumed))
    if (/[a-z0-9]/i.test(leftover)) {
      issues.push({
        line: lineNo,
        text: line,
        message: `Ignored "${leftover}" — put each product on its own "Product: count" line.`,
      })
    }
  })

  if (entries.length > STOCK_COUNT_MAX_LINES) {
    issues.push({
      line: 0,
      text: '',
      message: `Too many lines (${entries.length}); a count can hold at most ${STOCK_COUNT_MAX_LINES}.`,
    })
  }
  return { entries, issues }
}

// ── Doses ────────────────────────────────────────────────────────────────

export type DoseUnit = 'mg' | 'mcg' | 'ml' | 'iu'

export interface DoseAmounts {
  /** One amount per compound ("10mg / 5mg" → [10, 5]). */
  parts: number[]
  /** null for a bare number ("GLOW 70"). */
  unit: DoseUnit | null
  total: number
}

const AMOUNT_RE = /(\d[\d,]*(?:\.\d+)?)\s*(mg|mcg|ml|iu)\b/gi

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

function amounts(parts: number[], unit: DoseUnit | null): DoseAmounts {
  return { parts, unit, total: round(parts.reduce((s, p) => s + p, 0)) }
}

/** Parse a stored or typed dose ("10.0mg", "5mg / 5mg", "3mL", "10IU"). */
export function parseDoseAmounts(text: string | null | undefined): DoseAmounts | null {
  if (!text?.trim()) return null
  const parts: number[] = []
  let unit: DoseUnit | null = null
  for (const m of text.matchAll(AMOUNT_RE)) {
    const n = Number(m[1].replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    parts.push(n)
    unit ??= m[2].toLowerCase() as DoseUnit
  }
  if (parts.length > 0) return amounts(parts, unit)
  const bare = text
    .split(/\s*[/+]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (bare.length > 0 && bare.every((s) => /^\d+(?:\.\d+)?$/.test(s))) {
    return amounts(bare.map(Number), null)
  }
  return null
}

const UNIT_LABEL: Record<DoseUnit, string> = { mg: 'mg', mcg: 'mcg', ml: 'mL', iu: 'IU' }

/** "10mg", "5mg/5mg", "3mL" — the trailing ".0" catalog imports carry is dropped. */
export function formatDoseAmounts(dose: DoseAmounts): string {
  const unit = dose.unit ? UNIT_LABEL[dose.unit] : ''
  return dose.parts.map((p) => `${round(p)}${unit}`).join('/')
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6
}

function unitsCompatible(a: DoseUnit | null, b: DoseUnit | null): boolean {
  if (!a || !b || a === b) return true
  // HCG is sold as "10,000" and stored as mg or IU interchangeably.
  return (a === 'mg' || a === 'iu') && (b === 'mg' || b === 'iu')
}

/** A single typed amount also matches a blend's total ("BPC-TB 10mg" = 5mg/5mg). */
export function doseMatches(query: DoseAmounts, candidate: DoseAmounts | null): boolean {
  if (!candidate || !unitsCompatible(query.unit, candidate.unit)) return false
  if (query.parts.length === 1) return sameNumber(query.total, candidate.total)
  if (query.parts.length !== candidate.parts.length) return false
  const a = [...query.parts].sort((x, y) => x - y)
  const b = [...candidate.parts].sort((x, y) => x - y)
  return a.every((p, i) => sameNumber(p, b[i]))
}

export interface ParsedCountLabel {
  /** Label with the dose removed ("BPC-TB combo"). */
  name: string
  dose: DoseAmounts | null
  /** Trailing unit-less number ("GLOW 70" → 70), tried as a dose if the name alone fails. */
  bareNumber: number | null
}

export function parseCountLabel(label: string): ParsedCountLabel {
  const found = [...label.matchAll(AMOUNT_RE)]
  let name = label
  let dose: DoseAmounts | null = null
  if (found.length > 0) {
    // Remove "10mg/5mg" as one span so no dangling separator is left behind.
    const spans: Array<[number, number]> = []
    for (let i = 0; i < found.length; ) {
      const start = found[i].index ?? 0
      let end = start + found[i][0].length
      let j = i + 1
      while (j < found.length && /^\s*[/+&]\s*$/.test(label.slice(end, found[j].index))) {
        end = (found[j].index ?? 0) + found[j][0].length
        j += 1
      }
      spans.push([start, end])
      i = j
    }
    for (const [start, end] of spans.reverse()) {
      name = `${name.slice(0, start)} ${name.slice(end)}`
    }
    dose = amounts(
      found.map((m) => Number(m[1].replace(/,/g, ''))),
      found[0][2].toLowerCase() as DoseUnit
    )
  }
  name = name
    .replace(/\s+/g, ' ')
    .replace(/\s*[/+&]\s*$/, '')
    .trim()
  let bareNumber: number | null = null
  if (!dose) {
    const m = /^.*\S\s+(\d[\d,]*(?:\.\d+)?)$/.exec(name)
    if (m) bareNumber = Number(m[1].replace(/,/g, ''))
  }
  return { name, dose, bareNumber }
}

// ── Names ────────────────────────────────────────────────────────────────

const NOISE_WORDS = new Set([
  'vial',
  'vials',
  'combo',
  'blend',
  'peptide',
  'peptides',
  'research',
  'lyophilized',
  'kit',
  'kits',
  'box',
  'boxes',
  'pack',
  'pcs',
  'units',
  'unit',
  'each',
  'ea',
])

// Shorthand the warehouse uses → the compact compound key of the catalog name.
const ALIASES: Record<string, readonly string[]> = {
  bpc: ['bpc157'],
  tb: ['tb500'],
  tb4: ['tb500'],
  thymosinbeta4: ['tb500'],
  ipa: ['ipamorelin'],
  ipam: ['ipamorelin'],
  cjc: ['cjc1295'],
  cjcnodac: ['cjc1295nodac'],
  cjcwithout: ['cjc1295nodac'],
  cjc1295wo: ['cjc1295nodac'],
  cjc1295without: ['cjc1295nodac'],
  cjc1295withoutdac: ['cjc1295nodac'],
  modgrf: ['cjc1295nodac'],
  modgrf129: ['cjc1295nodac'],
  cjcdac: ['cjc1295dac'],
  cjcwith: ['cjc1295dac'],
  cjcwithdac: ['cjc1295dac'],
  cjc1295with: ['cjc1295dac'],
  cjc1295withdac: ['cjc1295dac'],
  tesa: ['tesamorelin'],
  sema: ['semaglutide'],
  glpsm: ['semaglutide'],
  tirz: ['tirzepatide'],
  glptz: ['tirzepatide'],
  reta: ['retatrutide'],
  glprt: ['retatrutide'],
  glpr: ['retatrutide'],
  mots: ['motsc'],
  motc: ['motsc'],
  ghk: ['ghkcu'],
  ghkcopper: ['ghkcu'],
  nadplus: ['nad'],
  bac: ['bacteriostaticwater'],
  bacwater: ['bacteriostaticwater'],
  bach2o: ['bacteriostaticwater'],
  bacteriostatic: ['bacteriostaticwater'],
  somatropin: ['hgh'],
  growthhormone: ['hgh'],
  humangrowthhormone: ['hgh'],
  '5amino': ['5amino1mq'],
  '5aminoiq': ['5amino1mq'],
  '5amq': ['5amino1mq'],
  thymolin: ['thymalin'],
  ta1: ['thymosinalpha1'],
  thymosina1: ['thymosinalpha1'],
  thymosinalpha: ['thymosinalpha1'],
  epitalon: ['epithalon'],
  epithalone: ['epithalon'],
  melanotan1: ['mt1'],
  melanotani: ['mt1'],
  melanotan2: ['mt2'],
  melanotanii: ['mt2'],
  melanotaniiacetate: ['mt2'],
  bremelanotide: ['pt141'],
  elamipretide: ['ss31'],
  kisspeptin10: ['kisspeptin'],
  cagri: ['cagrilintide'],
  aod: ['aod9604'],
  foxo4dri: ['foxo4'],
  bpctb: ['bpc157', 'tb500'],
  bpctb500: ['bpc157', 'tb500'],
  bpc157tb: ['bpc157', 'tb500'],
  bpc157tb500: ['bpc157', 'tb500'],
  cjcipa: ['cjc1295', 'ipamorelin'],
  tesaipa: ['tesamorelin', 'ipamorelin'],
}

function compactKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Compound keys of a name: "CJC-1295 (no DAC) + Ipamorelin" → [cjc1295nodac, ipamorelin]. */
function canonicalSegments(text: string): string[] {
  const lowered = text
    .toLowerCase()
    .replace(/\bw\/o\b/g, ' without ')
    .replace(/\bw\//g, ' with ')
  const out: string[] = []
  for (const rawSegment of lowered.split(/\s*(?:\/|\+|&|\band\b)\s*/)) {
    const tokens = rawSegment
      .replace(/[()[\]]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && !NOISE_WORDS.has(compactKey(t)))
    const key = compactKey(tokens.join(''))
    if (!key) continue
    out.push(...(ALIASES[key] ?? [key]))
  }
  return out
}

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (a.length > b.length) i += 1
    else if (b.length > a.length) j += 1
    else {
      i += 1
      j += 1
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

function segmentSimilarity(query: string, key: string): number {
  if (query === key) return 1
  if (query.length >= 3 && key.startsWith(query)) return 0.8
  // Typos only on long, digit-free names: "with" vs "without" DAC or MT-1 vs
  // MT-2 differ by a character or two and must never fuzzy-match.
  if (!/\d/.test(query) && !/\d/.test(key) && Math.min(query.length, key.length) >= 6) {
    if (withinOneEdit(query, key)) return 0.7
  }
  return 0
}

/** Every query compound must match a distinct key compound; extra key compounds dilute the score. */
function keyScore(query: string[], key: string[]): number {
  if (query.length === 0 || query.length > key.length) return 0
  const used = new Set<number>()
  let sum = 0
  for (const q of query) {
    let best = 0
    let bestIdx = -1
    key.forEach((k, idx) => {
      if (used.has(idx)) return
      const s = segmentSimilarity(q, k)
      if (s > best) {
        best = s
        bestIdx = idx
      }
    })
    if (bestIdx < 0) return 0
    used.add(bestIdx)
    sum += best
  }
  return sum / key.length
}

// ── Catalog ──────────────────────────────────────────────────────────────

export interface StockCountBatch {
  id: string
  batchNumber: string
  /** Beyond-use date (date-only UTC midnight in the DB). */
  bud: string | Date
  status: 'RECEIVED' | 'DEPLETED' | 'VOIDED'
  qtyOnHand: number
}

export interface StockCountCatalogVariant {
  variantId: string
  /** Stored Product.name (INN / compound chain). */
  productName: string
  aka?: string | null
  dose: string | null
  sku: string | null
  /** Variant ACTIVE — it appears in Inventory → By Product. */
  variantActive: boolean
  /** Product ACTIVE — it is offered in the shop. */
  productActive: boolean
  onHand: number
  reserved: number
  /** Non-voided batches. */
  batches: StockCountBatch[]
  /**
   * Net on-hand movement recorded after the count was taken (shipments,
   * receipts, returns, voids — never audit corrections), replayed on top of
   * the counted number so a count entered days later is still exact.
   */
  sinceCount?: number
}

/** On-hand a count sets: what was counted plus everything recorded since. */
export function countTarget(counted: number, sinceCount = 0): number {
  return Math.max(0, counted + sinceCount)
}

export interface StockCountVariantRef {
  variantId: string
  name: string
  dose: string
  sku: string | null
  active: boolean
}

interface IndexedVariant {
  v: StockCountCatalogVariant
  ref: StockCountVariantRef
  doses: DoseAmounts[]
  doseTotal: number
  keys: Array<{ segments: string[]; weight: number }>
  skuLower: string | null
  skuCompact: string | null
}

function indexVariant(v: StockCountCatalogVariant): IndexedVariant {
  const name = displayProductName(v.productName, v.sku)
  const shownDose = displayCatalogDose(v.productName, v.sku, v.dose ?? '')
  const doses = [parseDoseAmounts(shownDose), parseDoseAmounts(v.dose)].filter(
    (d): d is DoseAmounts => d !== null
  )
  const primary = new Set([v.productName, name, ...glpSearchAliases(v.productName, v.sku)])
  const keys: IndexedVariant['keys'] = []
  const addKey = (text: string, weight: number) => {
    for (const form of [text, text.replace(/\([^)]*\)/g, ' ')]) {
      const segments = canonicalSegments(form)
      if (segments.length > 0) keys.push({ segments, weight })
    }
  }
  for (const n of primary) addKey(n, 1)
  // aka lists synonyms and blend compounds; slightly below the real name so
  // "BPC-TB" prefers the BPC/TB blend over GLOW (aka GHK-Cu / BPC-157 / TB-500).
  if (v.aka?.trim()) addKey(v.aka, 0.9)
  const sku = v.sku?.trim() || null
  return {
    v,
    ref: {
      variantId: v.variantId,
      name,
      dose: doses[0] ? formatDoseAmounts(doses[0]) : shownDose || v.dose || '',
      sku,
      active: v.variantActive && v.productActive,
    },
    doses,
    doseTotal: doses[0]?.total ?? Number.POSITIVE_INFINITY,
    keys,
    skuLower: sku ? sku.toLowerCase() : null,
    skuCompact: sku ? compactKey(sku) : null,
  }
}

function byDoseThenSku(a: IndexedVariant, b: IndexedVariant): number {
  return (
    a.doseTotal - b.doseTotal ||
    (a.ref.sku ?? '').localeCompare(b.ref.sku ?? '') ||
    a.ref.variantId.localeCompare(b.ref.variantId)
  )
}

function refLabel(ref: StockCountVariantRef): string {
  return [ref.name, ref.dose, ref.sku ? `(${ref.sku})` : ''].filter(Boolean).join(' ')
}

// ── Matching ─────────────────────────────────────────────────────────────

export type StockCountMatchStatus = 'matched' | 'ambiguous' | 'unmatched' | 'duplicate'

export interface StockCountMatch {
  entry: StockCountEntry
  status: StockCountMatchStatus
  variantId: string | null
  matchedBy: 'sku' | 'name' | null
  /** Ambiguous: the options. Unmatched: closest names / the product's real sizes. */
  candidates: StockCountVariantRef[]
  message: string | null
}

type Resolution = Omit<StockCountMatch, 'entry'>

const MIN_NAME_SCORE = 0.5
const TIE_MARGIN = 0.05

function matched(iv: IndexedVariant, by: 'sku' | 'name'): Resolution {
  return {
    status: 'matched',
    variantId: iv.v.variantId,
    matchedBy: by,
    candidates: [],
    message: null,
  }
}

function unmatched(message: string, candidates: IndexedVariant[] = []): Resolution {
  return {
    status: 'unmatched',
    variantId: null,
    matchedBy: null,
    candidates: candidates.map((c) => c.ref),
    message,
  }
}

function ambiguous(pool: IndexedVariant[], dose: DoseAmounts | null): Resolution {
  const sorted = [...pool].sort(byDoseThenSku)
  const names = new Set(sorted.map((c) => c.ref.name))
  const sizes = Array.from(new Set(sorted.map((c) => c.ref.dose)))
  let message: string
  if (names.size === 1 && sizes.length === sorted.length) {
    message = `${sorted[0].ref.name} comes in ${sorted.length} sizes — add the size (${sizes.join(', ')}) or use the SKU.`
  } else if (names.size === 1 && sizes.length === 1) {
    const skus = sorted.map((c) => c.ref.sku ?? '(no SKU)').join(', ')
    message = `${sorted.length} catalog items are ${sorted[0].ref.name} ${dose ? formatDoseAmounts(dose) : sizes[0]} (${skus}) — use the SKU to pick one.`
  } else {
    message = `Matches ${sorted.length} catalog items (${sorted.map((c) => refLabel(c.ref)).join('; ')}) — be more specific or use the SKU.`
  }
  return {
    status: 'ambiguous',
    variantId: null,
    matchedBy: null,
    candidates: sorted.map((c) => c.ref),
    message,
  }
}

function pickActive(pool: IndexedVariant[]): IndexedVariant[] {
  const active = pool.filter((c) => c.ref.active)
  return active.length > 0 ? active : pool
}

function resolveByName(
  nameText: string,
  dose: DoseAmounts | null,
  index: IndexedVariant[]
): Resolution {
  const query = canonicalSegments(nameText)
  if (query.length === 0) return unmatched('Missing the product name.')

  const scored = index
    .map((iv) => ({
      iv,
      score: Math.max(0, ...iv.keys.map((k) => keyScore(query, k.segments) * k.weight)),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || byDoseThenSku(a.iv, b.iv))

  if (scored.length === 0 || scored[0].score < MIN_NAME_SCORE) {
    return unmatched(
      `No catalog product matches "${nameText}".`,
      scored.slice(0, 3).map((s) => s.iv)
    )
  }

  const best = scored[0].score
  const top = scored.filter((s) => s.score >= best - TIE_MARGIN).map((s) => s.iv)
  const withDose = (pool: IndexedVariant[]) =>
    dose ? pool.filter((iv) => iv.doses.some((d) => doseMatches(dose, d))) : pool

  let hits = withDose(top)
  if (dose && hits.length === 0) {
    // "Tesamorelin 10mg/5mg": the single peptide is the closer name, but only
    // the Tesamorelin/Ipamorelin blend comes in that size.
    const rest = scored
      .filter((s) => s.score >= MIN_NAME_SCORE && s.score < best - TIE_MARGIN)
      .map((s) => s.iv)
    hits = withDose(rest)
  }
  if (hits.length === 0 && dose) {
    const sorted = [...top].sort(byDoseThenSku)
    const sizes = Array.from(new Set(sorted.map((c) => c.ref.dose))).join(', ')
    return unmatched(
      `${sorted[0].ref.name} has no ${formatDoseAmounts(dose)} size (sizes: ${sizes}).`,
      sorted
    )
  }

  const pool = pickActive(hits)
  if (pool.length === 1) return matched(pool[0], 'name')
  return ambiguous(pool, dose)
}

function resolveBySku(label: string, index: IndexedVariant[]): Resolution | null {
  const lower = label.trim().toLowerCase()
  const exact = index.filter((iv) => iv.skuLower === lower)
  if (exact.length === 1) return matched(exact[0], 'sku')
  const key = compactKey(label)
  if (!key) return null
  const loose = index.filter((iv) => iv.skuCompact === key)
  if (loose.length === 1) return matched(loose[0], 'sku')
  if (loose.length > 1) return ambiguous(loose, null)
  return null
}

function resolveEntry(entry: StockCountEntry, index: IndexedVariant[]): Resolution {
  const bySku = resolveBySku(entry.label, index)
  if (bySku) return bySku

  const parsed = parseCountLabel(entry.label)
  const attempts: Resolution[] = [resolveByName(parsed.name, parsed.dose, index)]
  if (attempts[0].status === 'matched') return attempts[0]

  if (parsed.bareNumber !== null) {
    const name = parsed.name.replace(/\s+\d[\d,]*(?:\.\d+)?$/, '')
    const bare = resolveByName(name, amounts([parsed.bareNumber], null), index)
    if (bare.status === 'matched') return bare
    attempts.push(bare)
  }

  // SKU written as name + size: "MS 40mg" → MS40.
  if (parsed.dose && parsed.dose.parts.length === 1) {
    const viaSku = resolveBySku(`${parsed.name}${round(parsed.dose.total)}`, index)
    if (viaSku?.status === 'matched') return viaSku
  }

  return attempts.find((a) => a.status === 'ambiguous') ?? attempts[0]
}

/** Resolve every entry to a catalog variant; two entries on one variant are both flagged. */
export function matchStockCountEntries(
  entries: StockCountEntry[],
  catalog: StockCountCatalogVariant[]
): StockCountMatch[] {
  const index = catalog.map(indexVariant)
  const byId = new Map(index.map((iv) => [iv.v.variantId, iv]))
  const results: StockCountMatch[] = entries.map((entry) => ({
    entry,
    ...resolveEntry(entry, index),
  }))

  const groups = new Map<string, StockCountMatch[]>()
  for (const r of results) {
    if (r.status !== 'matched' || !r.variantId) continue
    const list = groups.get(r.variantId)
    if (list) list.push(r)
    else groups.set(r.variantId, [r])
  }
  for (const [variantId, group] of groups) {
    if (group.length < 2) continue
    const ref = byId.get(variantId)?.ref
    for (const r of group) {
      const others = group
        .filter((o) => o !== r)
        .map((o) => `line ${o.entry.line} ("${o.entry.label}")`)
        .join(', ')
      r.status = 'duplicate'
      r.message = `Same item as ${others} — both are ${ref ? refLabel(ref) : 'one catalog item'}. Keep one line with the total.`
    }
  }
  return results
}

// ── Batch reconciliation ─────────────────────────────────────────────────

export interface StockCountBatchChange {
  batchId: string
  batchNumber: string
  /** YYYY-MM-DD */
  bud: string
  from: number
  to: number
}

export interface StockCountBatchPlan {
  /** Units in non-voided batches before the count. */
  batchTotal: number
  changes: StockCountBatchChange[]
  /** A new batch for units no usable batch can hold (only when a BUD was given). */
  newBatch: { bud: string; qty: number } | null
  /** Counted units left outside any usable batch. */
  unbatched: number
}

/** YYYY-MM-DD of a date-only value, timezone-safe for strings. */
export function budDay(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return new Date(value).toISOString().slice(0, 10)
}

/**
 * Move batch quantities so they total the counted number.
 * - Lower count: drain FIFO, soonest BUD first (expired stock goes first), as
 *   fulfillment would have shipped it.
 * - Higher count: top up the soonest-BUD batch that is still usable (BUD ≥
 *   today), preferring active batches over re-opening depleted ones — the
 *   conservative BUD for labels printed from it. With no usable batch the
 *   units stay unbatched unless `newBatchBud` is given for a new batch.
 */
export function planBatchReconciliation(
  batches: StockCountBatch[],
  counted: number,
  today: Date,
  newBatchBud?: string | null
): StockCountBatchPlan {
  const live = batches
    .filter((b) => b.status !== 'VOIDED')
    .map((b) => ({ ...b, day: budDay(b.bud), qty: Math.max(0, b.qtyOnHand) }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.batchNumber.localeCompare(b.batchNumber))
  const batchTotal = live.reduce((s, b) => s + b.qty, 0)
  const change = (b: (typeof live)[number], to: number): StockCountBatchChange => ({
    batchId: b.id,
    batchNumber: b.batchNumber,
    bud: b.day,
    from: b.qtyOnHand,
    to,
  })

  if (counted < batchTotal) {
    let remove = batchTotal - counted
    const changes: StockCountBatchChange[] = []
    for (const b of live) {
      if (remove <= 0) break
      const take = Math.min(b.qty, remove)
      if (take <= 0) continue
      changes.push(change(b, b.qty - take))
      remove -= take
    }
    return { batchTotal, changes, newBatch: null, unbatched: 0 }
  }

  const surplus = counted - batchTotal
  if (surplus === 0) return { batchTotal, changes: [], newBatch: null, unbatched: 0 }

  const todayKey = budDay(today)
  const usable = live.filter((b) => b.day >= todayKey)
  const target = usable.find((b) => b.status === 'RECEIVED') ?? usable[0]
  if (target) {
    return {
      batchTotal,
      changes: [change(target, target.qty + surplus)],
      newBatch: null,
      unbatched: 0,
    }
  }
  if (newBatchBud && budDay(newBatchBud) >= todayKey) {
    return {
      batchTotal,
      changes: [],
      newBatch: { bud: budDay(newBatchBud), qty: surplus },
      unbatched: 0,
    }
  }
  return { batchTotal, changes: [], newBatch: null, unbatched: surplus }
}

/** Warnings for one counted variant (never block the apply). */
export function stockCountWarnings(
  v: Pick<StockCountCatalogVariant, 'reserved' | 'variantActive' | 'productActive'>,
  counted: number,
  sinceCount: number,
  plan: Pick<StockCountBatchPlan, 'unbatched'>
): string[] {
  const warnings: string[] = []
  const target = countTarget(counted, sinceCount)
  if (counted + sinceCount < 0) {
    warnings.push(
      `${-sinceCount} left stock after the count but only ${counted} were counted — on-hand set to 0; check the count.`
    )
  }
  if (v.reserved > target) {
    warnings.push(
      `${v.reserved} reserved for open orders but only ${target} on hand after the count — those orders can't all ship from stock.`
    )
  }
  if (plan.unbatched > 0) {
    warnings.push(
      `No usable batch for ${plan.unbatched} unit(s) — add their BUD to record a batch, or vial labels and FedEx stock checks will come up short.`
    )
  }
  if (!v.variantActive) {
    warnings.push('Inactive in the catalog — hidden from Inventory and the shop until reactivated.')
  } else if (!v.productActive) {
    warnings.push('Product is inactive — hidden from the shop until reactivated.')
  }
  return warnings
}

// ── Preview ──────────────────────────────────────────────────────────────

export type StockCountLineStatus = 'ready' | 'unchanged' | 'ambiguous' | 'unmatched' | 'duplicate'

export interface StockCountPreviewLine {
  /** Stable row key: `entry:<index>` or `unlisted:<variantId>`. */
  key: string
  /** `unlisted` = a product not on the list, zeroed by request. */
  source: 'entry' | 'unlisted'
  entry: StockCountEntry | null
  status: StockCountLineStatus
  message: string | null
  matchedBy: 'sku' | 'name' | null
  variant: StockCountVariantRef | null
  candidates: StockCountVariantRef[]
  /** As typed. */
  counted: number
  /** Net movement recorded after the count time (0 when counted just now). */
  sinceCount: number
  /** On-hand after applying (counted + sinceCount, floored at 0); null while blocked. */
  target: number | null
  /** On-hand now; null while the line is blocked. */
  before: number | null
  delta: number | null
  reserved: number | null
  batchTotal: number | null
  batchChanges: StockCountBatchChange[]
  unbatched: number
  warnings: string[]
}

export interface StockCountPreviewTotals {
  entries: number
  ready: number
  unchanged: number
  blocked: number
  unitsBefore: number
  unitsAfter: number
  netChange: number
  increased: number
  decreased: number
  unbatchedUnits: number
}

export interface StockCountPreview {
  lines: StockCountPreviewLine[]
  issues: StockCountParseIssue[]
  /** Active variants with stock that the list doesn't mention (left unchanged). */
  unlisted: Array<StockCountVariantRef & { onHand: number }>
  totals: StockCountPreviewTotals
  canApply: boolean
}

function applicableLine(
  key: string,
  source: StockCountPreviewLine['source'],
  entry: StockCountEntry | null,
  iv: IndexedVariant,
  counted: number,
  matchedBy: StockCountPreviewLine['matchedBy'],
  today: Date
): StockCountPreviewLine {
  const sinceCount = iv.v.sinceCount ?? 0
  const target = countTarget(counted, sinceCount)
  const plan = planBatchReconciliation(iv.v.batches, target, today)
  const delta = target - iv.v.onHand
  return {
    key,
    source,
    entry,
    status: delta !== 0 || plan.changes.length > 0 ? 'ready' : 'unchanged',
    message: null,
    matchedBy,
    variant: iv.ref,
    candidates: [],
    counted,
    sinceCount,
    target,
    before: iv.v.onHand,
    delta,
    reserved: iv.v.reserved,
    batchTotal: plan.batchTotal,
    batchChanges: plan.changes,
    unbatched: plan.unbatched,
    warnings: stockCountWarnings(iv.v, counted, sinceCount, plan),
  }
}

function byName(a: IndexedVariant, b: IndexedVariant): number {
  return (
    a.ref.name.localeCompare(b.ref.name, undefined, { sensitivity: 'base' }) || byDoseThenSku(a, b)
  )
}

/**
 * Parse + match + plan in one pass. `zeroUnlisted` turns every active variant
 * the list doesn't mention (and that still holds stock) into an explicit
 * "counted 0" line, for a full wall-to-wall count.
 */
export function buildStockCountPreview(input: {
  text: string
  catalog: StockCountCatalogVariant[]
  zeroUnlisted?: boolean
  today?: Date
}): StockCountPreview {
  const today = input.today ?? new Date()
  const { entries, issues } = parseStockCountText(input.text)
  const index = new Map(input.catalog.map((v) => [v.variantId, indexVariant(v)]))
  const matches = matchStockCountEntries(entries, input.catalog)

  const mentioned = new Set<string>()
  const lines: StockCountPreviewLine[] = matches.map((m) => {
    if (m.variantId) mentioned.add(m.variantId)
    if (m.status === 'ambiguous') m.candidates.forEach((c) => mentioned.add(c.variantId))
    const iv = m.variantId ? index.get(m.variantId) : undefined
    if (m.status === 'matched' && iv) {
      return applicableLine(
        `entry:${m.entry.index}`,
        'entry',
        m.entry,
        iv,
        m.entry.qty,
        m.matchedBy,
        today
      )
    }
    return {
      key: `entry:${m.entry.index}`,
      source: 'entry',
      entry: m.entry,
      status: m.status === 'matched' ? 'unmatched' : m.status,
      message: m.message,
      matchedBy: m.matchedBy,
      variant: iv?.ref ?? null,
      candidates: m.candidates,
      counted: m.entry.qty,
      sinceCount: 0,
      target: null,
      before: null,
      delta: null,
      reserved: null,
      batchTotal: null,
      batchChanges: [],
      unbatched: 0,
      warnings: [],
    }
  })

  const notMentioned = [...index.values()]
    .filter((iv) => iv.v.variantActive && !mentioned.has(iv.v.variantId))
    .sort(byName)
  let unlisted: StockCountPreview['unlisted'] = []
  if (input.zeroUnlisted) {
    for (const iv of notMentioned) {
      const batchUnits = iv.v.batches.reduce(
        (s, b) => s + (b.status === 'VOIDED' ? 0 : Math.max(0, b.qtyOnHand)),
        0
      )
      if (iv.v.onHand === 0 && batchUnits === 0) continue
      lines.push(applicableLine(`unlisted:${iv.v.variantId}`, 'unlisted', null, iv, 0, null, today))
    }
  } else {
    unlisted = notMentioned
      .filter((iv) => iv.v.onHand > 0)
      .map((iv) => ({ ...iv.ref, onHand: iv.v.onHand }))
  }

  const totals: StockCountPreviewTotals = {
    entries: entries.length,
    ready: 0,
    unchanged: 0,
    blocked: 0,
    unitsBefore: 0,
    unitsAfter: 0,
    netChange: 0,
    increased: 0,
    decreased: 0,
    unbatchedUnits: 0,
  }
  for (const l of lines) {
    if (l.status === 'ready' || l.status === 'unchanged') {
      totals[l.status] += 1
      totals.unitsBefore += l.before ?? 0
      totals.unitsAfter += l.target ?? 0
      totals.netChange += l.delta ?? 0
      if ((l.delta ?? 0) > 0) totals.increased += 1
      if ((l.delta ?? 0) < 0) totals.decreased += 1
      totals.unbatchedUnits += l.unbatched
    } else {
      totals.blocked += 1
    }
  }

  return {
    lines,
    issues,
    unlisted,
    totals,
    canApply: issues.length === 0 && totals.blocked === 0 && totals.ready + totals.unchanged > 0,
  }
}

// ── Apply payload ────────────────────────────────────────────────────────

export interface StockCountApplyLine {
  variantId: string
  counted: number
  /** On-hand the preview showed — the apply aborts if stock moved since. */
  expectedOnHand: number
  /** Batch units the preview showed. */
  expectedBatchTotal: number
  /** BUD for a new batch holding units no usable batch can take (YYYY-MM-DD). */
  newBatchBud?: string | null
  /** The line as typed, for the audit trail. */
  label?: string | null
}

/** Lines the preview can apply (ready + unchanged), in display order. */
export function toApplyLines(preview: StockCountPreview): StockCountApplyLine[] {
  return preview.lines
    .filter((l) => (l.status === 'ready' || l.status === 'unchanged') && l.variant)
    .map((l) => ({
      variantId: l.variant!.variantId,
      counted: l.counted,
      expectedOnHand: l.before ?? 0,
      expectedBatchTotal: l.batchTotal ?? 0,
      label: l.entry?.label ?? null,
    }))
}

/** Semantic checks on an apply payload; returns the first problem or null. */
export function validateStockCountApplyLines(lines: StockCountApplyLine[]): string | null {
  if (lines.length === 0) return 'A stock count needs at least one line.'
  if (lines.length > STOCK_COUNT_MAX_LINES) {
    return `A stock count can hold at most ${STOCK_COUNT_MAX_LINES} lines.`
  }
  const seen = new Set<string>()
  for (const line of lines) {
    if (!line.variantId) return 'Every line needs a product.'
    if (seen.has(line.variantId)) return 'A product appears more than once in the count.'
    seen.add(line.variantId)
    if (
      !Number.isSafeInteger(line.counted) ||
      line.counted < 0 ||
      line.counted > STOCK_COUNT_MAX_QTY
    ) {
      return 'Counts must be whole numbers between 0 and 1,000,000.'
    }
    if (
      !Number.isSafeInteger(line.expectedOnHand) ||
      !Number.isSafeInteger(line.expectedBatchTotal)
    ) {
      return 'Preview snapshot is missing — preview the count again.'
    }
    if (line.newBatchBud && !/^\d{4}-\d{2}-\d{2}$/.test(line.newBatchBud)) {
      return 'BUD must be a YYYY-MM-DD date.'
    }
  }
  return null
}
