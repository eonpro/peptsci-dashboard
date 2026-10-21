import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {
  generateVialLabelsPdf,
  TIME_ACADEMY_BRAND_KEY,
  isLabelBrandKey,
  resolveLabelBrandKey,
  LABEL_BRAND_OPTIONS,
} from '../labels/generateVialLabelsPdf'
import { usesPhysicianUseLabels } from '../labels/brandKeys'
import { PUO_GLYPH_PATHS } from '../labels/peptsciLabelPdf'
import {
  embedTimeAcademyFonts,
  formatTimeAcademyBud,
  generateTimeAcademyLabelSheetPdf,
  generateTimeAcademyLabelsPdf,
  planTimeAcademyLabel,
  timeAcademyRailLines,
  type TimeAcademyLabelPlan,
  type TimeAcademyMeasure,
  type TimeAcademyTextRun,
} from '../labels/timeAcademyLabelPdf'
import {
  TIME_ACADEMY_TEMPLATE_PNG_B64,
  ROBOTO_CONDENSED_REGULAR_B64,
} from '../labels/timeAcademyEmbeddedAssets'
import {
  DOSE_BASELINE,
  DOSE_BASELINE_TEAL,
  DOSE_BOX,
  DOSE_BOX_CENTER_X,
  NAME_BASELINE,
  NAME_CENTER_X,
  NAME_LINE1_BASELINE,
  NAME_MAX_WIDTH,
  NAME_TRACKING_EM,
  PURITY_SIDE_BASELINE_X,
  RAIL_BATCH_BASELINE_X,
  RAIL_BUD_BASELINE_X,
  RAIL_END_Y,
  RAIL_START_Y,
  TIME_ACADEMY_TEAL_HEX,
} from '../labels/timeAcademyLayout'

const DIR = path.join(process.cwd(), 'public', 'labels', 'clients', 'time-academy')
const FONTS = path.join(process.cwd(), 'public', 'fonts', 'labels')

const NAD = {
  productName: 'NAD+',
  dose: '500mg',
  purity: '99%HPLC',
  batchNumber: 'NAD500-022028',
  budIsoDate: '2028-02-28',
}

function groupPaths(svg: string, id: string): string[] {
  const group = new RegExp(`<g id="${id}">([\\s\\S]*?)</g>`).exec(svg)
  assert.ok(group, `artwork has no <g id="${id}">`)
  return [...group[1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1])
}

async function realMeasure(): Promise<TimeAcademyMeasure> {
  const fonts = await embedTimeAcademyFonts(await PDFDocument.create())
  return {
    sofia: (text, size) => fonts.sofia.widthOfTextAtSize(text, size),
    roboto: (text, size) => fonts.roboto.widthOfTextAtSize(text, size),
  }
}

const runsOf = (plan: TimeAcademyLabelPlan, role: TimeAcademyTextRun['role']) =>
  plan.runs.filter((run) => run.role === role)

function runWidth(run: TimeAcademyTextRun, measure: TimeAcademyMeasure): number {
  const base = measure[run.font](run.text, run.size)
  return base + (run.trackingEm ?? 0) * run.size * Math.max(0, run.text.length - 1)
}

const sofiaMetrics = fontkit.create(readFileSync(path.join(FONTS, 'SofiaPro-Regular.ttf')))
const SOFIA_CAP_EM = sofiaMetrics.capHeight / sofiaMetrics.unitsPerEm

/** The lower name line's capitals start below the upper line's baseline. */
function assertStackClear(upper: TimeAcademyTextRun, lower: TimeAcademyTextRun) {
  const lowerCapTop = lower.y - lower.size * SOFIA_CAP_EM
  assert.ok(lowerCapTop > upper.y + 1, `"${lower.text}" collides with "${upper.text}"`)
}

describe('TIME Academy brand key', () => {
  it('is registered and selectable in the client picker', () => {
    assert.equal(TIME_ACADEMY_BRAND_KEY, 'time_academy')
    assert.equal(isLabelBrandKey('time_academy'), true)
    assert.deepEqual(
      LABEL_BRAND_OPTIONS.find((o) => o.key === TIME_ACADEMY_BRAND_KEY),
      { key: 'time_academy', label: 'TIME Academy' }
    )
  })

  it('resolves when enabled and infers from the practice name when never configured', () => {
    assert.equal(
      resolveLabelBrandKey({ whiteLabelEnabled: true, labelBrandKey: 'time_academy' }),
      'time_academy'
    )
    assert.equal(
      resolveLabelBrandKey({
        organizationName: 'TIME Academy of Regenerative Medicine & Longevity Science',
      }),
      'time_academy'
    )
    assert.equal(
      resolveLabelBrandKey({
        whiteLabelEnabled: false,
        labelBrandKey: 'time_academy',
        organizationName: 'TIME Academy',
      }),
      null
    )
  })

  it('does not claim practices that merely contain the word "time"', () => {
    for (const organizationName of ['Lifetime Academy', 'Overtime Health', 'Timeless Wellness']) {
      assert.equal(resolveLabelBrandKey({ organizationName }), null, organizationName)
    }
  })

  it('prints the physician-use mark, so the packing slip says physician use too', () => {
    assert.equal(usesPhysicianUseLabels('time_academy'), true)
  })
})

describe('TIME Academy artwork', () => {
  const svg = readFileSync(path.join(DIR, 'time-academy-label-empty.svg'), 'utf8')

  it('bakes the exact PeptSci PUO outlines and no RUO or warning text', () => {
    assert.deepEqual(groupPaths(svg, 'use-mark'), [...PUO_GLYPH_PATHS])
    assert.ok(!svg.includes('use-warning'), 'the client proof has no warning column')
    assert.ok(!svg.includes('M36.87,37.14'), 'no RUO outline')
  })

  it('carries the logo, the teal palette and the 99%HPLC band', () => {
    assert.equal(groupPaths(svg, 'purity').length, '99%HPLC'.length)
    const logo = /<g id="time-academy-logo"[^>]*>([\s\S]*?)<\/g>/.exec(svg)
    assert.ok(logo, 'logo group present')
    const supplied = readFileSync(path.join(DIR, 'time-academy-logo.svg'), 'utf8')
    assert.equal(logo[1].match(/<path /g)?.length, supplied.match(/<path /g)?.length)
    assert.ok(svg.includes(`fill="${TIME_ACADEMY_TEAL_HEX}"`))
    assert.ok(svg.includes('viewBox="0 0 144 54"'), 'OL4891LP label in points')
  })

  it('bundles the same template and rail font that are on disk (Vercel prints from them)', () => {
    const png = readFileSync(path.join(DIR, 'time-academy-label-template.png')).toString('base64')
    assert.ok(TIME_ACADEMY_TEMPLATE_PNG_B64 === png, 'embedded template drifted from the PNG')
    const font = readFileSync(path.join(FONTS, 'RobotoCondensed-Regular.ttf')).toString('base64')
    assert.ok(ROBOTO_CONDENSED_REGULAR_B64 === font, 'embedded rail font drifted from the TTF')
  })
})

describe('TIME Academy rail text', () => {
  it('formats the BUD as MM/DD/YY like the proof', () => {
    assert.equal(formatTimeAcademyBud('2028-02-28'), '02/28/28')
    assert.equal(formatTimeAcademyBud('2027-07-21T00:00:00.000Z'), '07/21/27')
    assert.equal(formatTimeAcademyBud('02/28/2028'), '02/28/28')
    assert.equal(formatTimeAcademyBud('02/28/28'), '02/28/28')
  })

  it('leaves the BUD blank rather than printing a made-up date', () => {
    assert.equal(formatTimeAcademyBud(''), '')
    assert.equal(formatTimeAcademyBud('soon'), '')
  })

  it('prints BATCH: and BUD lines with the lot upper-cased', () => {
    assert.deepEqual(timeAcademyRailLines(' nad500-022028 ', '2028-02-28'), [
      'BATCH: NAD500-022028',
      'BUD 02/28/28',
    ])
    assert.deepEqual(timeAcademyRailLines('', ''), ['BATCH:', 'BUD'])
  })
})

describe('TIME Academy label layout', () => {
  it('lays out the proof: name over the box, dose in the black band, rail on the right', async () => {
    const measure = await realMeasure()
    const plan = planTimeAcademyLabel(NAD, measure)

    assert.deepEqual(plan.covers, [])
    const [name] = runsOf(plan, 'name')
    assert.equal(name.text, 'NAD+')
    assert.equal(name.size, 10.5)
    assert.equal(name.y, NAME_BASELINE)
    assert.equal(name.trackingEm, NAME_TRACKING_EM)
    assert.ok(Math.abs(name.x + runWidth(name, measure) / 2 - NAME_CENTER_X) < 0.01)

    const [dose] = runsOf(plan, 'dose')
    assert.equal(dose.text, '500mg')
    assert.equal(dose.color, 'white')
    assert.equal(dose.y, DOSE_BASELINE)
    assert.ok(Math.abs(dose.x + runWidth(dose, measure) / 2 - DOSE_BOX_CENTER_X) < 0.01)

    const rail = runsOf(plan, 'rail')
    assert.deepEqual(
      rail.map((r) => [r.text, r.x, r.y, r.rotate, r.color]),
      [
        ['BATCH: NAD500-022028', RAIL_BATCH_BASELINE_X, RAIL_START_Y, 90, 'ink'],
        ['BUD 02/28/28', RAIL_BUD_BASELINE_X, RAIL_START_Y, 90, 'ink'],
      ]
    )
    assert.equal(rail[0].size, rail[1].size)
    assert.equal(runsOf(plan, 'purity').length, 0, 'single-compound purity stays baked')
  })

  it('breaks long names onto two lines above the fixed box, second compound in teal', async () => {
    const measure = await realMeasure()
    const plan = planTimeAcademyLabel(
      { ...NAD, productName: 'CJC-1295 and Ipamorelin', dose: '5mg' },
      measure
    )
    const names = runsOf(plan, 'name')
    assert.deepEqual(
      names.map((r) => [r.text, r.y, r.color]),
      [
        ['CJC-1295', NAME_LINE1_BASELINE, 'ink'],
        ['and ', NAME_BASELINE, 'ink'],
        ['Ipamorelin', NAME_BASELINE, 'teal'],
      ]
    )
    assert.ok(names[1].size <= names[0].size)
    assertStackClear(names[0], names[1])
    for (const run of names) {
      assert.ok(
        run.x >= NAME_CENTER_X - NAME_MAX_WIDTH / 2 - 0.01,
        `${run.text} clears the divider`
      )
      assert.ok(run.x + runWidth(run, measure) <= NAME_CENTER_X + NAME_MAX_WIDTH / 2 + 0.5)
    }
    assert.deepEqual(plan.covers, [], 'box is not moved or repainted')
  })

  it('puts the second blend dose in the teal band and the purity beside the box', async () => {
    const measure = await realMeasure()
    const plan = planTimeAcademyLabel(
      { ...NAD, productName: 'BPC-157 / TB-500', dose: '10mg/10mg' },
      measure
    )
    assert.deepEqual(
      runsOf(plan, 'dose').map((r) => [r.text, r.y]),
      [
        ['10mg', DOSE_BASELINE],
        ['10mg', DOSE_BASELINE_TEAL],
      ]
    )
    assert.deepEqual(
      plan.covers.map((c) => c.color),
      ['teal'],
      'baked 99%HPLC hidden'
    )
    const [purity] = runsOf(plan, 'purity')
    assert.equal(purity.text, '99%HPLC')
    assert.equal(purity.rotate, 90)
    assert.equal(purity.x, PURITY_SIDE_BASELINE_X)
    const centre = purity.y - runWidth(purity, measure) / 2
    assert.ok(Math.abs(centre - (DOSE_BOX.top + DOSE_BOX.bottom) / 2) < 0.01)
  })

  it('joins three-compound blend doses compactly in the teal band', async () => {
    const plan = planTimeAcademyLabel(
      { ...NAD, productName: 'GLOW', dose: '50mg/10mg/10mg' },
      await realMeasure()
    )
    assert.deepEqual(
      runsOf(plan, 'dose').map((r) => r.text),
      ['50mg', '10mg/10mg']
    )
  })

  it('prints BAC water with the volume only — no PUO, purity, BATCH or BUD', async () => {
    const plan = planTimeAcademyLabel(
      {
        productName: 'Bacteriostatic Water',
        dose: '3mL',
        purity: '',
        batchNumber: '',
        budIsoDate: '',
      },
      await realMeasure()
    )
    assert.deepEqual(
      plan.covers.map((c) => c.color),
      ['white', 'teal']
    )
    const names = runsOf(plan, 'name')
    assert.deepEqual(
      names.map((r) => [r.text, r.color]),
      [
        ['BAC', 'ink'],
        ['Water', 'teal'],
      ]
    )
    assertStackClear(names[0], names[1])
    assert.deepEqual(
      runsOf(plan, 'dose').map((r) => r.text),
      ['3mL']
    )
    assert.equal(runsOf(plan, 'rail').length, 0)
  })

  it('keeps an over-long lot and name inside their space', async () => {
    const measure = await realMeasure()
    const plan = planTimeAcademyLabel(
      {
        ...NAD,
        productName: 'Supercalifragilisticexpialidocious',
        batchNumber: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD',
      },
      measure
    )
    const [name] = runsOf(plan, 'name')
    assert.ok(name.text.endsWith('…'))
    assert.ok(runWidth(name, measure) <= NAME_MAX_WIDTH + 0.01)
    for (const run of runsOf(plan, 'rail')) {
      assert.ok(
        run.y - runWidth(run, measure) >= RAIL_END_Y - 0.01,
        `${run.text} overruns the rail`
      )
    }
  })
})

describe('TIME Academy label PDFs', () => {
  it('prints under the time_academy brand key with the real artwork', async () => {
    const { pdf, brand, labelsPrinted } = await generateVialLabelsPdf(TIME_ACADEMY_BRAND_KEY, [
      { ...NAD, quantity: 2 },
    ])
    assert.equal(brand, 'time_academy')
    assert.equal(labelsPrinted, 2)
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF')
    assert.ok(pdf.length > 50_000, `expected the template image, got ${pdf.length} bytes`)
  })

  it('flows an order with every label variant across sheets from the start slot', async () => {
    const { labelsPrinted, nextStartSlot, startSlot, pdf } = await generateTimeAcademyLabelsPdf(
      [
        { req: NAD, quantity: 10 },
        { req: { ...NAD, productName: 'CJC-1295 and Ipamorelin', dose: '5mg' }, quantity: 10 },
        { req: { ...NAD, productName: 'BPC-157 / TB-500', dose: '10mg/10mg' }, quantity: 10 },
        {
          req: {
            productName: 'Bacteriostatic Water',
            dose: '10mL',
            purity: '',
            batchNumber: '',
            budIsoDate: '',
          },
          quantity: 10,
        },
      ],
      { startSlot: 30 }
    )
    assert.equal(startSlot, 30)
    assert.equal(labelsPrinted, 40)
    assert.equal(nextStartSlot, (30 + 40) % 36)
    const doc = await PDFDocument.load(pdf)
    assert.equal(doc.getPageCount(), 2)
  })

  it('returns one blank sheet when there is nothing to print', async () => {
    const { pdf, labelsPrinted } = await generateTimeAcademyLabelsPdf([{ req: NAD, quantity: 0 }])
    assert.equal(labelsPrinted, 0)
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1)
  })

  it('renders a single centred proof label', async () => {
    const pdf = await generateTimeAcademyLabelSheetPdf({ ...NAD, quantity: 1, proofMode: true })
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF')
    const doc = await PDFDocument.load(pdf)
    assert.equal(doc.getPageCount(), 1)
    assert.deepEqual(doc.getPage(0).getSize(), { width: 612, height: 792 })
  })
})
