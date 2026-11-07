import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStockCountPreview,
  matchStockCountEntries,
  parseCountLabel,
  parseDoseAmounts,
  parseStockCountText,
  planBatchReconciliation,
  toApplyLines,
  validateCountedAt,
  validateStockCountApplyLines,
  type StockCountBatch,
  type StockCountCatalogVariant,
  type StockCountPreview,
} from '../inventory/stock-count-core.ts'

// The physical count the PeptSci admin sent on 2026-11-05, verbatim (quotes,
// trailing spaces, blank lines and the two-entries-on-one-line NAD row included).
const NOV_5_COUNT = `"5 amino IQ: 64 vials
AOD 9604: 93 vials
BAC water 3ml: 84 vials
BAC water 10ml: 93 vials 
BPC-157 5mg: 126 vials
BPC-157 10mg: 20 vial
BPC-TB 10mg combo: 20 vials
BPC-TB 20mg combo: 96

Cagrilintide: 25 vials 
Cerebrolysin: 20 vials
CJC-1295 w/o: 0
CJC-1295 with: 11 vials
CJC/IPA: 91 vials
DSIP: 112 vials
Epithalon 10mg: 0
Epithalon 50mg: 17 vials
GHK 50mg: 75 vials
GLOW 70: 19 vials
GLP-SM 5mg: 119 vials
GLP-SM 10mg: 13
HCG 10,000mg: 5 vial
HGH: 24 vials 
IGF-1LR3: 29 vials
IPAMORELIN: 81 vials
Kisspeptin: 46 vials
KLOW 80mg: 42 vials
KPV: 50 
Mot-C 10mg: 9 vials
Mot-C 40mg: 20 vials
MT-1: 49 vials
MT-2: 23 vials
NAD 500mg: 100 vials NAD 1000mg: 136 vials
PT-141: 57 vials
GLP-RT 5mg: 34 vials 
GLP-RT 10mg: 189 vials 
GLP-RT 20mg: 97 vials
GLP-RT 30mg: 256 vials 
SELANK: 70 vials
SEMAX: 36 vials
SLU-PP: 30 vials
SS-31: 14 vials
TB-500 5mg: 28 vials
TB-500 10mg: 83 vials
Tesamorelin: 44 vials
Thymosin-alpha-1: 59 vials
Thymolin: 50 vials 
Sermorelin: 168 vials
Tirzepatide: 230

MS 40mg: 20

"`

const TODAY = new Date('2026-11-05T15:00:00.000Z')

function variant(
  sku: string,
  productName: string,
  dose: string | null,
  extra: Partial<StockCountCatalogVariant> = {}
): StockCountCatalogVariant {
  return {
    variantId: `v-${sku}`,
    productName,
    aka: null,
    dose,
    sku,
    variantActive: true,
    productActive: true,
    onHand: 0,
    reserved: 0,
    batches: [],
    ...extra,
  }
}

// Mirrors the live catalog's offered SKUs (peptsci.com/catalog, 2026-11-05),
// with the stored INN / compound-chain product names behind the trade names.
const CATALOG: StockCountCatalogVariant[] = [
  variant('5AM', '5-Amino-1MQ', '5mg'),
  variant('AOD5', 'AOD-9604', '5mg'),
  variant('BAC-H2O-3ML', 'Bacteriostatic Water', '3mL'),
  variant('BAC-H2O-10ML', 'Bacteriostatic Water', '10mL'),
  variant('BAC-H2O', 'Bacteriostatic Water', '0mg'),
  variant('BC5', 'BPC-157', '5.0mg'),
  variant('BC10', 'BPC-157', '10.0mg'),
  variant('BB10', 'BPC-157 and TB-500', '5mg / 5mg'),
  variant('BB20', 'BPC-157 and TB-500', '10mg / 10mg'),
  variant('CGL10', 'Cagrilintide', '10.0mg'),
  variant('CBL60', 'Cerebrolysin', '60.0mg'),
  variant('CD5', 'CJC-1295 With DAC', '5.0mg'),
  variant('CND5', 'CJC-1295 Without DAC', '5.0mg'),
  variant('CP10', 'CJC-1295 (no DAC) + Ipamorelin', '10.0mg'),
  variant('DSIP-10MG', 'DSIP', '10mg'),
  variant('ET10', 'Epithalon', '10.0mg'),
  variant('ET50', 'Epithalon', '50.0mg'),
  variant('F410', 'FOXO4', '10.0mg'),
  variant('GHK-50', 'GHK-Cu', '50mg'),
  variant('GLOW', 'GLOW', '50mg / 10mg / 10mg', { aka: 'GHK-Cu / BPC-157 / TB-500' }),
  variant('SM5', 'Semaglutide', '5.0mg'),
  variant('SM10', 'Semaglutide', '10.0mg'),
  // Sermorelin really is stocked under this GLP-looking SKU in production.
  variant('SM-10', 'Sermorelin', '10mg'),
  variant('G10K', 'HCG', '10000.0mg'),
  variant('HGH-15MG', 'hGH', '15mg'),
  variant('IG1', 'IGF-1LR3', '1.0mg'),
  variant('IPAMORELIN-10MG', 'Ipamorelin', '10mg'),
  variant('KISSPEPTIN-10MG', 'Kisspeptin', '10mg'),
  variant('KLOW', 'KLOW', '80mg', { aka: 'GHK-Cu / BPC-157 / KPV / TB-500' }),
  variant('KPV10', 'KPV', '10.0mg'),
  variant('MS10', 'MOTS-c', '10.0mg'),
  variant('MS40', 'MOTS-c', '40.0mg'),
  variant('MT-10', 'MT-2 (Melanotan II Acetate)', '10.0mg'),
  variant('NAD500', 'NAD+', '500 mg'),
  variant('NAD1000', 'NAD+', '1000 mg'),
  variant('P41', 'PT-141', '10.0mg'),
  variant('RT5', 'Retatrutide', '5.0mg', { aka: 'GLP-1 / GIP / Glucagon Triple Agonist' }),
  variant('RT10', 'Retatrutide', '10.0mg', { aka: 'GLP-1 / GIP / Glucagon Triple Agonist' }),
  variant('RT20', 'Retatrutide', '20.0mg', { aka: 'GLP-1 / GIP / Glucagon Triple Agonist' }),
  variant('RT30', 'Retatrutide', '30mg', { aka: 'GLP-1 / GIP / Glucagon Triple Agonist' }),
  variant('SK10', 'Selank', '10.0mg'),
  variant('XA10', 'Semax', '10.0mg'),
  variant('322', 'SLU-PP-332', '5.0mg'),
  variant('2S10', 'SS-31', '10.0mg'),
  variant('2S50', 'SS-31', '50.0mg'),
  variant('TB500-5', 'TB-500', '5 mg'),
  variant('TB500-10', 'TB-500', '10 mg'),
  variant('TSM10', 'Tesamorelin', '10.0mg'),
  variant('TSIP', 'Tesamorelin and Ipamorelin', '10mg / 5mg'),
  variant('TA10', 'Thymosin alpha-1', '10mg'),
  variant('TY10', 'Thymalin', '10.0mg'),
  variant('TR10', 'Tirzepatide', '10.0mg'),
  variant('TR20', 'Tirzepatide', '20.0mg'),
  variant('TR30', 'Tirzepatide', '30.0mg'),
  variant('TR60', 'Tirzepatide', '60.0mg'),
]

function matchOne(label: string, catalog: StockCountCatalogVariant[] = CATALOG) {
  const { entries } = parseStockCountText(`${label}: 1`)
  assert.equal(entries.length, 1, `expected one entry for "${label}"`)
  return matchStockCountEntries(entries, catalog)[0]
}

function skuOf(variantId: string | null | undefined): string | null {
  return variantId ? variantId.replace(/^v-/, '') : null
}

function batch(
  id: string,
  bud: string,
  qtyOnHand: number,
  status: StockCountBatch['status'] = qtyOnHand > 0 ? 'RECEIVED' : 'DEPLETED'
): StockCountBatch {
  return { id, batchNumber: id.toUpperCase(), bud, status, qtyOnHand }
}

describe('parseStockCountText', () => {
  test('reads every entry of the 11/5 count, including two on one line', () => {
    const { entries, issues } = parseStockCountText(NOV_5_COUNT)
    assert.deepEqual(issues, [])
    assert.equal(entries.length, 50)
    assert.deepEqual(entries[0], { index: 1, line: 1, label: '5 amino IQ', qty: 64 })
    const nad = entries.filter((e) => e.label.startsWith('NAD'))
    assert.deepEqual(
      nad.map((e) => [e.label, e.qty, e.line]),
      [
        ['NAD 500mg', 100, 33],
        ['NAD 1000mg', 136, 33],
      ]
    )
    assert.deepEqual(
      entries.find((e) => e.label.startsWith('HCG')),
      { index: 21, line: 22, label: 'HCG 10,000mg', qty: 5 }
    )
    assert.equal(entries.find((e) => e.label === 'KPV')?.qty, 50)
    assert.equal(entries.find((e) => e.label === 'CJC-1295 w/o')?.qty, 0)
    assert.deepEqual(entries.at(-1), { index: 50, line: 51, label: 'MS 40mg', qty: 20 })
  })

  test('accepts tab and equals separators, bullets, headers and thousands separators', () => {
    const { entries, issues } = parseStockCountText(
      'Product\tCount\nBPC-157 5mg\t126\nTB-500 10mg = 1,083 units\n• KPV: 7 vials'
    )
    assert.deepEqual(issues, [])
    assert.deepEqual(
      entries.map((e) => [e.label, e.qty]),
      [
        ['BPC-157 5mg', 126],
        ['TB-500 10mg', 1083],
        ['KPV', 7],
      ]
    )
  })

  test('flags lines without a count, fractional counts and leftover text', () => {
    const { entries, issues } = parseStockCountText(
      'Inventory count Nov 5\nBPC-157 5mg 126\nTB-500: 2.5\nKPV: 4 vials (2 opened)\n"\n---'
    )
    assert.equal(entries.length, 1)
    assert.deepEqual(entries[0], { index: 1, line: 4, label: 'KPV', qty: 4 })
    assert.deepEqual(
      issues.map((i) => i.line),
      [1, 2, 3, 4]
    )
    assert.match(issues[0].message, /no count/i)
    assert.match(issues[2].message, /whole number/i)
    assert.match(issues[3].message, /\(2 opened\)/)
  })

  test('rejects oversized input', () => {
    const { entries, issues } = parseStockCountText('x'.repeat(50_001))
    assert.equal(entries.length, 0)
    assert.match(issues[0].message, /too long/i)
  })
})

describe('parseCountLabel / parseDoseAmounts', () => {
  test('splits the dose out of the product label', () => {
    assert.deepEqual(parseCountLabel('BPC-TB 10mg combo'), {
      name: 'BPC-TB combo',
      dose: { parts: [10], unit: 'mg', total: 10 },
      bareNumber: null,
    })
    assert.deepEqual(parseCountLabel('HCG 10,000mg').dose, {
      parts: [10000],
      unit: 'mg',
      total: 10000,
    })
    assert.deepEqual(parseCountLabel('BAC water 3ml').dose, { parts: [3], unit: 'ml', total: 3 })
    assert.equal(parseCountLabel('GLOW 70').bareNumber, 70)
    for (const label of [
      'CJC-1295 w/o',
      'IGF-1LR3',
      'Thymosin-alpha-1',
      'MT-1',
      'SS-31',
      'AOD 9604',
    ]) {
      assert.equal(parseCountLabel(label).dose, null, label)
    }
  })

  test('parses stored catalog doses, blends included', () => {
    assert.deepEqual(parseDoseAmounts('10mg / 5mg'), { parts: [10, 5], unit: 'mg', total: 15 })
    assert.deepEqual(parseDoseAmounts('50mg / 10mg / 10mg'), {
      parts: [50, 10, 10],
      unit: 'mg',
      total: 70,
    })
    assert.deepEqual(parseDoseAmounts('10000.0mg'), { parts: [10000], unit: 'mg', total: 10000 })
    assert.deepEqual(parseDoseAmounts('500 mg'), { parts: [500], unit: 'mg', total: 500 })
    assert.deepEqual(parseDoseAmounts('10IU'), { parts: [10], unit: 'iu', total: 10 })
    assert.equal(parseDoseAmounts(''), null)
    assert.equal(parseDoseAmounts(null), null)
  })
})

describe('matchStockCountEntries', () => {
  const EXPECTED: Array<[string, string]> = [
    ['5 amino IQ', '5AM'],
    ['AOD 9604', 'AOD5'],
    ['BAC water 3ml', 'BAC-H2O-3ML'],
    ['BAC water 10ml', 'BAC-H2O-10ML'],
    ['BPC-157 5mg', 'BC5'],
    ['BPC-157 10mg', 'BC10'],
    ['BPC-TB 10mg combo', 'BB10'],
    ['BPC-TB 20mg combo', 'BB20'],
    ['Cagrilintide', 'CGL10'],
    ['Cerebrolysin', 'CBL60'],
    ['CJC-1295 w/o', 'CND5'],
    ['CJC-1295 with', 'CD5'],
    ['CJC/IPA', 'CP10'],
    ['DSIP', 'DSIP-10MG'],
    ['Epithalon 10mg', 'ET10'],
    ['Epithalon 50mg', 'ET50'],
    ['GHK 50mg', 'GHK-50'],
    ['GLOW 70', 'GLOW'],
    ['GLP-SM 5mg', 'SM5'],
    ['HCG 10,000mg', 'G10K'],
    ['HGH', 'HGH-15MG'],
    ['IGF-1LR3', 'IG1'],
    ['IPAMORELIN', 'IPAMORELIN-10MG'],
    ['Kisspeptin', 'KISSPEPTIN-10MG'],
    ['KLOW 80mg', 'KLOW'],
    ['KPV', 'KPV10'],
    ['Mot-C 10mg', 'MS10'],
    ['MT-2', 'MT-10'],
    ['NAD 500mg', 'NAD500'],
    ['NAD 1000mg', 'NAD1000'],
    ['PT-141', 'P41'],
    ['GLP-RT 5mg', 'RT5'],
    ['GLP-RT 10mg', 'RT10'],
    ['GLP-RT 20mg', 'RT20'],
    ['GLP-RT 30mg', 'RT30'],
    ['SELANK', 'SK10'],
    ['SEMAX', 'XA10'],
    ['SLU-PP', '322'],
    ['TB-500 5mg', 'TB500-5'],
    ['TB-500 10mg', 'TB500-10'],
    ['Tesamorelin', 'TSM10'],
    ['Thymosin-alpha-1', 'TA10'],
    ['Thymolin', 'TY10'],
    ['Tirzepatide 60mg', 'TR60'],
    ['GLP-SM 10mg', 'SM10'],
    ['Sermorelin', 'SM-10'],
  ]

  for (const [label, sku] of EXPECTED) {
    test(`"${label}" → ${sku}`, () => {
      const m = matchOne(label)
      assert.equal(m.status, 'matched', `${label}: ${m.message}`)
      assert.equal(skuOf(m.variantId), sku)
    })
  }

  test('a size-less line for a multi-size product is ambiguous, never guessed', () => {
    const tirz = matchOne('Tirzepatide')
    assert.equal(tirz.status, 'ambiguous')
    assert.deepEqual(
      tirz.candidates.map((c) => skuOf(c.variantId)),
      ['TR10', 'TR20', 'TR30', 'TR60']
    )
    assert.match(tirz.message ?? '', /10mg, 20mg, 30mg, 60mg/)

    const ss31 = matchOne('SS-31')
    assert.equal(ss31.status, 'ambiguous')
    assert.deepEqual(
      ss31.candidates.map((c) => skuOf(c.variantId)),
      ['2S10', '2S50']
    )
  })

  test('two catalog items with the same size are ambiguous until the SKU is used', () => {
    const catalog = [...CATALOG, variant('SM10B', 'Semaglutide', '10mg')]
    const m = matchOne('GLP-SM 10mg', catalog)
    assert.equal(m.status, 'ambiguous')
    assert.deepEqual(m.candidates.map((c) => skuOf(c.variantId)).sort(), ['SM10', 'SM10B'])
    assert.match(m.message ?? '', /SKU/)
    assert.equal(skuOf(matchOne('SM10', catalog).variantId), 'SM10')
    assert.equal(skuOf(matchOne('SM10B', catalog).variantId), 'SM10B')
  })

  test('Sermorelin under the GLP-looking SKU SM-10 is never read as GLP-SM', () => {
    assert.equal(skuOf(matchOne('SM-10').variantId), 'SM-10')
    assert.deepEqual(
      matchOne('GLP-SM').candidates.map((c) => skuOf(c.variantId)),
      ['SM5', 'SM10']
    )
  })

  test('size and SKU forms resolve the ambiguous lines', () => {
    assert.equal(skuOf(matchOne('Tirzepatide 30mg').variantId), 'TR30')
    assert.equal(skuOf(matchOne('GLP-TZ 60mg').variantId), 'TR60')
    assert.equal(skuOf(matchOne('TR20').variantId), 'TR20')
    assert.equal(skuOf(matchOne('SS-31 50mg').variantId), '2S50')
    assert.equal(skuOf(matchOne('Retatrutide 20mg').variantId), 'RT20')
  })

  test('SKU shorthand with a size ("MS 40mg") resolves through the SKU', () => {
    const m = matchOne('MS 40mg')
    assert.equal(m.status, 'matched')
    assert.equal(skuOf(m.variantId), 'MS40')
    assert.equal(m.matchedBy, 'sku')
  })

  test('unknown products are unmatched instead of borrowing a look-alike', () => {
    const mt1 = matchOne('MT-1')
    assert.equal(mt1.status, 'unmatched')
    assert.equal(mt1.variantId, null)
    assert.equal(matchOne('Tesofensine').status, 'unmatched')
    assert.equal(matchOne('MT').status, 'unmatched')
  })

  test('a size the product does not come in is unmatched and lists the real sizes', () => {
    const m = matchOne('Epithalon 25mg')
    assert.equal(m.status, 'unmatched')
    assert.match(m.message ?? '', /10mg, 50mg/)
  })

  test('single peptides are not confused with blends that contain them', () => {
    assert.equal(skuOf(matchOne('TB-500').variantId), null) // two sizes → ambiguous
    assert.deepEqual(
      matchOne('TB-500').candidates.map((c) => skuOf(c.variantId)),
      ['TB500-5', 'TB500-10']
    )
    assert.equal(skuOf(matchOne('Tesamorelin 10mg/5mg').variantId), 'TSIP')
    assert.equal(skuOf(matchOne('BPC-157/TB-500 10mg/10mg').variantId), 'BB20')
    assert.equal(skuOf(matchOne('Ipamorelin 10mg').variantId), 'IPAMORELIN-10MG')
  })

  test('"CJC-1295" without with/without is ambiguous between the two', () => {
    const m = matchOne('CJC-1295')
    assert.equal(m.status, 'ambiguous')
    assert.deepEqual(m.candidates.map((c) => skuOf(c.variantId)).sort(), ['CD5', 'CND5'])
  })

  test('"with" never fuzzy-matches the "without" product', () => {
    const onlyWithout = CATALOG.filter((v) => v.sku !== 'CD5')
    assert.equal(matchOne('CJC-1295 with', onlyWithout).status, 'unmatched')
  })

  test('mg and IU are interchangeable for the same number (HCG)', () => {
    assert.equal(skuOf(matchOne('HCG 10000 IU').variantId), 'G10K')
  })

  test('BAC water matches its mL size even when the stored dose is 0mg', () => {
    const m = matchOne('Bacteriostatic water 30ml')
    assert.equal(skuOf(m.variantId), 'BAC-H2O')
  })

  test('an active variant wins over an inactive duplicate; inactive-only still matches', () => {
    const catalog = [
      variant('OLD-KPV', 'KPV', '10mg', { variantActive: false, variantId: 'v-OLD-KPV' }),
      ...CATALOG,
    ]
    assert.equal(skuOf(matchOne('KPV', catalog).variantId), 'KPV10')
    const onlyInactive = [variant('SER5', 'Sermorelin', '5mg', { productActive: false })]
    const m = matchOne('Sermorelin', onlyInactive)
    assert.equal(m.status, 'matched')
    assert.equal(skuOf(m.variantId), 'SER5')
  })
})

describe('planBatchReconciliation', () => {
  test('a lower count drains batches FIFO, soonest BUD (and expired) first', () => {
    const plan = planBatchReconciliation(
      [batch('b', '2027-03-01', 30), batch('a', '2026-10-01', 10), batch('c', '2027-06-01', 5)],
      22,
      TODAY
    )
    assert.deepEqual(plan.changes, [
      { batchId: 'a', batchNumber: 'A', bud: '2026-10-01', from: 10, to: 0 },
      { batchId: 'b', batchNumber: 'B', bud: '2027-03-01', from: 30, to: 17 },
    ])
    assert.equal(plan.batchTotal, 45)
    assert.equal(plan.unbatched, 0)
  })

  test('a higher count tops up the soonest-BUD active batch that is not expired', () => {
    const plan = planBatchReconciliation(
      [
        batch('old', '2026-09-01', 4),
        batch('late', '2027-08-01', 10),
        batch('soon', '2027-01-15', 6),
      ],
      30,
      TODAY
    )
    assert.deepEqual(plan.changes, [
      { batchId: 'soon', batchNumber: 'SOON', bud: '2027-01-15', from: 6, to: 16 },
    ])
    assert.equal(plan.unbatched, 0)
  })

  test('a batch whose BUD is today still counts as usable', () => {
    const plan = planBatchReconciliation([batch('t', '2026-11-05', 1)], 3, TODAY)
    assert.deepEqual(
      plan.changes.map((c) => [c.batchId, c.to]),
      [['t', 3]]
    )
  })

  test('falls back to re-opening a depleted batch, then to unbatched units', () => {
    const reopen = planBatchReconciliation(
      [batch('dep', '2027-02-01', 0), batch('exp', '2026-01-01', 2)],
      5,
      TODAY
    )
    assert.deepEqual(reopen.changes, [
      { batchId: 'dep', batchNumber: 'DEP', bud: '2027-02-01', from: 0, to: 3 },
    ])

    const none = planBatchReconciliation([batch('exp', '2026-01-01', 2)], 9, TODAY)
    assert.deepEqual(none.changes, [])
    assert.equal(none.unbatched, 7)

    const empty = planBatchReconciliation([], 12, TODAY)
    assert.equal(empty.unbatched, 12)
  })

  test('a count equal to the batch total changes nothing; zero drains everything', () => {
    assert.deepEqual(planBatchReconciliation([batch('a', '2027-01-01', 8)], 8, TODAY).changes, [])
    const zero = planBatchReconciliation(
      [batch('a', '2027-01-01', 8), batch('b', '2027-02-01', 2)],
      0,
      TODAY
    )
    assert.deepEqual(
      zero.changes.map((c) => [c.batchId, c.to]),
      [
        ['a', 0],
        ['b', 0],
      ]
    )
  })

  test('a BUD for the uncovered units plans a new batch; a past BUD is refused', () => {
    const plan = planBatchReconciliation([batch('exp', '2026-01-01', 2)], 9, TODAY, '2027-09-30')
    assert.deepEqual(plan.newBatch, { bud: '2027-09-30', qty: 7 })
    assert.equal(plan.unbatched, 0)

    const past = planBatchReconciliation([], 4, TODAY, '2026-11-04')
    assert.equal(past.newBatch, null)
    assert.equal(past.unbatched, 4)

    const covered = planBatchReconciliation([batch('a', '2027-01-01', 1)], 4, TODAY, '2027-09-30')
    assert.equal(covered.newBatch, null)
  })

  test('voided batches are ignored', () => {
    const plan = planBatchReconciliation(
      [batch('v', '2027-01-01', 50, 'VOIDED'), batch('a', '2027-02-01', 5)],
      5,
      TODAY
    )
    assert.equal(plan.batchTotal, 5)
    assert.deepEqual(plan.changes, [])
  })
})

describe('buildStockCountPreview', () => {
  function preview(text: string, catalog = CATALOG, zeroUnlisted = false): StockCountPreview {
    return buildStockCountPreview({ text, catalog, zeroUnlisted, today: TODAY })
  }

  test('the raw 11/5 count is blocked until its 5 problem lines are fixed', () => {
    const p = preview(NOV_5_COUNT)
    assert.equal(p.canApply, false)
    const blocked = p.lines.filter((l) => l.status !== 'ready' && l.status !== 'unchanged')
    assert.deepEqual(
      blocked.map((l) => [l.entry?.label, l.status]),
      [
        ['Mot-C 40mg', 'duplicate'],
        ['MT-1', 'unmatched'],
        ['SS-31', 'ambiguous'],
        ['Tirzepatide', 'ambiguous'],
        ['MS 40mg', 'duplicate'],
      ]
    )
    const dup = p.lines.find((l) => l.entry?.label === 'MS 40mg')
    assert.match(dup?.message ?? '', /line 30/i)
    assert.equal(p.totals.entries, 50)
    assert.equal(p.totals.blocked, 5)
  })

  test('once fixed, every line applies and products not on the list are reported', () => {
    const fixed = NOV_5_COUNT.replace('GLP-SM 10mg: 13', 'SM10: 13')
      .replace('SS-31: 14 vials', 'SS-31 10mg: 14 vials')
      .replace('Tirzepatide: 230', 'Tirzepatide 30mg: 230')
      .replace('MS 40mg: 20', '')
      .replace('MT-1: 49 vials\n', '')
      .replace('Sermorelin: 168 vials\n', '')
    const catalog = CATALOG.map((v) =>
      v.sku === 'TSIP' ? { ...v, onHand: 12 } : v.sku === 'F410' ? { ...v, onHand: 3 } : v
    )
    const p = preview(fixed, catalog)
    assert.equal(
      p.canApply,
      true,
      JSON.stringify(
        p.lines.filter((l) => l.message),
        null,
        2
      )
    )
    assert.equal(p.totals.entries, 47)
    assert.equal(p.totals.blocked, 0)
    assert.equal(p.totals.unitsBefore, 0)
    assert.equal(p.totals.unitsAfter, 2940)
    assert.deepEqual(
      p.unlisted.map((u) => [u.sku, u.onHand]),
      [
        ['F410', 3],
        ['TSIP', 12],
      ]
    )
    assert.equal(toApplyLines(p).length, 47)
  })

  test('"set products not on the list to 0" adds explicit zero lines', () => {
    const catalog = CATALOG.map((v) =>
      v.sku === 'TSIP'
        ? { ...v, onHand: 12, batches: [batch('t1', '2027-04-01', 12)] }
        : v.sku === 'F410'
          ? { ...v, onHand: 0, batches: [batch('f1', '2027-04-01', 2)] }
          : v
    )
    const p = preview('KPV: 5', catalog, true)
    const zeroed = p.lines.filter((l) => l.source === 'unlisted')
    assert.deepEqual(
      zeroed.map((l) => [l.variant?.sku, l.before, l.counted, l.delta]),
      [
        ['F410', 0, 0, 0],
        ['TSIP', 12, 0, -12],
      ]
    )
    assert.equal(zeroed[0].status, 'ready') // batch drained even though on-hand is already 0
    assert.deepEqual(p.unlisted, [])
    assert.equal(p.canApply, true)
  })

  test('computes deltas, batch moves and warnings per line', () => {
    const catalog = CATALOG.map((v) => {
      if (v.sku === 'BC5') {
        return {
          ...v,
          onHand: 140,
          reserved: 4,
          batches: [batch('bc-a', '2027-01-01', 100), batch('bc-b', '2027-05-01', 40)],
        }
      }
      if (v.sku === 'KPV10') return { ...v, onHand: 10, reserved: 8 }
      if (v.sku === 'DSIP-10MG') return { ...v, onHand: 3, batches: [batch('d', '2027-01-01', 3)] }
      return v
    })
    const p = preview('BPC-157 5mg: 126\nKPV: 5\nDSIP: 3', catalog)
    const [bpc, kpv, dsip] = p.lines

    assert.equal(bpc.status, 'ready')
    assert.deepEqual([bpc.before, bpc.counted, bpc.delta, bpc.batchTotal], [140, 126, -14, 140])
    assert.deepEqual(
      bpc.batchChanges.map((c) => [c.batchId, c.from, c.to]),
      [['bc-a', 100, 86]]
    )
    assert.deepEqual(bpc.warnings, [])

    assert.equal(kpv.delta, -5)
    assert.equal(kpv.unbatched, 5)
    assert.ok(kpv.warnings.some((w) => /reserved/i.test(w)))
    assert.ok(kpv.warnings.some((w) => /usable batch/i.test(w)))

    assert.equal(dsip.status, 'unchanged')
    assert.deepEqual(dsip.batchChanges, [])

    assert.deepEqual(
      [
        p.totals.ready,
        p.totals.unchanged,
        p.totals.increased,
        p.totals.decreased,
        p.totals.netChange,
      ],
      [2, 1, 0, 2, -19]
    )
  })

  test('movements recorded after the count are replayed on top of it', () => {
    // Counted 126 on Thursday; 10 shipped Friday before the count was entered.
    const catalog = CATALOG.map((v) =>
      v.sku === 'BC5'
        ? {
            ...v,
            onHand: 120,
            sinceCount: -10,
            batches: [batch('bc-a', '2027-01-01', 90), batch('bc-b', '2027-05-01', 30)],
          }
        : v
    )
    const [line] = preview('BPC-157 5mg: 126', catalog).lines
    assert.deepEqual(
      [line.counted, line.sinceCount, line.target, line.before, line.delta],
      [126, -10, 116, 120, -4]
    )
    assert.deepEqual(
      line.batchChanges.map((c) => [c.batchId, c.from, c.to]),
      [['bc-a', 90, 86]]
    )
  })

  test('more stock left after the count than was counted clamps at zero with a warning', () => {
    const catalog = CATALOG.map((v) =>
      v.sku === 'KPV10' ? { ...v, onHand: 0, sinceCount: -8 } : v
    )
    const [line] = preview('KPV: 5', catalog).lines
    assert.deepEqual([line.target, line.delta, line.status], [0, 0, 'unchanged'])
    assert.ok(line.warnings.some((w) => /only 5 were counted/.test(w)))
  })

  test('a full count replays receipts that landed after it for unlisted products', () => {
    const catalog = CATALOG.map((v) =>
      v.sku === 'F410'
        ? { ...v, onHand: 6, sinceCount: 6, batches: [batch('f1', '2027-04-01', 6)] }
        : v
    )
    const zeroed = preview('KPV: 5', catalog, true).lines.find((l) => l.variant?.sku === 'F410')
    assert.deepEqual([zeroed?.counted, zeroed?.target, zeroed?.status], [0, 6, 'unchanged'])
  })

  test('nothing to apply when the text has no entries', () => {
    const p = preview('   \n"\n')
    assert.equal(p.canApply, false)
    assert.equal(p.lines.length, 0)
  })

  test('a parse issue blocks apply so no count is silently dropped', () => {
    const p = preview('KPV: 5\nBPC-157 5mg 126')
    assert.equal(p.issues.length, 1)
    assert.equal(p.canApply, false)
  })
})

describe('validateCountedAt', () => {
  const now = new Date('2026-11-07T14:42:00.000Z')

  test('defaults to now and accepts a past time', () => {
    assert.deepEqual(validateCountedAt(null, now), { at: now })
    assert.deepEqual(validateCountedAt('2026-11-06T00:17:00.000Z', now), {
      at: new Date('2026-11-06T00:17:00.000Z'),
    })
  })

  test('rejects future, very old and unreadable times', () => {
    assert.match(
      (validateCountedAt('2026-11-07T15:00:00.000Z', now) as { error: string }).error,
      /future/
    )
    assert.match(
      (validateCountedAt('2026-01-01T00:00:00.000Z', now) as { error: string }).error,
      /90 days/
    )
    assert.match((validateCountedAt('not a date', now) as { error: string }).error, /valid/)
  })
})

describe('validateStockCountApplyLines', () => {
  const line = { variantId: 'v1', counted: 3, expectedOnHand: 1, expectedBatchTotal: 0 }

  test('accepts well-formed lines', () => {
    assert.equal(validateStockCountApplyLines([line, { ...line, variantId: 'v2' }]), null)
  })

  test('rejects empty, duplicate, negative, fractional and oversized input', () => {
    assert.match(validateStockCountApplyLines([]) ?? '', /at least one/i)
    assert.match(validateStockCountApplyLines([line, line]) ?? '', /more than once/i)
    assert.match(validateStockCountApplyLines([{ ...line, counted: -1 }]) ?? '', /whole number/i)
    assert.match(validateStockCountApplyLines([{ ...line, counted: 1.5 }]) ?? '', /whole number/i)
    assert.match(
      validateStockCountApplyLines(
        Array.from({ length: 1001 }, (_, i) => ({ ...line, variantId: `v${i}` }))
      ) ?? '',
      /at most/i
    )
  })
})
