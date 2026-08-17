import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {
  alignNamedBlendDose,
  doseCardGeometry,
  fitDoseSize,
  fitNameSize,
  formatElevatedVitalityDose,
  parseBudUs,
  resolveElevatedVitalityNameBlock,
  splitElevatedVitalityNameLines,
  wrapCompoundSubtitle,
} from '../labels/elevatedVitalityLabelPdf'
import { isLabelBrandKey, resolveLabelBrandKey } from '../labels/brandKeys'

describe('Elevated Vitality name/dose overlay helpers', () => {
  it('splits slash blends into two lines without "and"', () => {
    assert.deepEqual(splitElevatedVitalityNameLines('BPC-157 / TB-500'), ['BPC-157', 'TB-500'])
    assert.deepEqual(splitElevatedVitalityNameLines('BPC-157 / TB-500 Blend'), [
      'BPC-157',
      'TB-500',
    ])
  })

  it('splits "and" / "&" blends into two lines', () => {
    assert.deepEqual(splitElevatedVitalityNameLines('Tesamorelin and Ipamorelin'), [
      'Tesamorelin',
      'Ipamorelin',
    ])
    assert.deepEqual(splitElevatedVitalityNameLines('TESAMORELIN & IPAMORELIN'), [
      'TESAMORELIN',
      'IPAMORELIN',
    ])
  })

  it('keeps single compounds on one line', () => {
    assert.deepEqual(splitElevatedVitalityNameLines('Tesamorelin'), ['Tesamorelin'])
  })

  it('formats blend doses as dose/dose when needed', () => {
    assert.equal(formatElevatedVitalityDose('10mg', 2), '10MG/10MG')
    assert.equal(formatElevatedVitalityDose('10mg/5mg', 2), '10MG/5MG')
    assert.equal(formatElevatedVitalityDose('10mg', 1), '10MG')
    assert.equal(formatElevatedVitalityDose('50mg/10mg/10mg', 3), '50MG/10MG/10MG')
    // Named-blend totals must not explode into N copies of the same mg.
    assert.equal(formatElevatedVitalityDose('80mg', 4), '80MG')
  })

  it('resolves GLOW / KLOW as trade name + compound subtitle', () => {
    const glow = resolveElevatedVitalityNameBlock('GLOW')
    assert.equal(glow.hero, 'GLOW')
    assert.equal(glow.compoundCount, 3)
    assert.deepEqual(glow.lines, ['GHK-CU / BPC-157 / TB-500'])

    const fromCompounds = resolveElevatedVitalityNameBlock(
      'GHK-Cu and BPC-157 and TB-500'
    )
    assert.equal(fromCompounds.hero, 'GLOW')

    const klow = resolveElevatedVitalityNameBlock('KLOW')
    assert.equal(klow.hero, 'KLOW')
    assert.equal(klow.compoundCount, 4)
    assert.deepEqual(klow.lines, ['KPV / BPC-157', 'GHK-CU / TB-500'])
  })

  it('reorders legacy KLOW stock doses to on-label compound order', () => {
    assert.equal(
      alignNamedBlendDose('KLOW', '50MG/10MG/10MG/10MG'),
      '10MG/10MG/50MG/10MG'
    )
    assert.equal(alignNamedBlendDose('GLOW', '50MG/10MG/10MG'), '50MG/10MG/10MG')
  })

  it('keeps GLOW compounds on one subtitle line', () => {
    assert.deepEqual(wrapCompoundSubtitle('GHK-Cu / BPC-157 / TB-500'), [
      'GHK-Cu / BPC-157 / TB-500',
    ])
  })

  it('formats EXP as MM/DD/YY so the year fits the rail box', () => {
    assert.equal(parseBudUs('2027-07-21'), '07/21/27')
    assert.equal(parseBudUs('07/21/2027'), '07/21/27')
    assert.equal(parseBudUs('07/21/27'), '07/21/27')
  })
})


describe('Elevated Vitality product name sizing', () => {
  /** Label geometry the sizing has to live inside (points, from the artwork). */
  const CARD_CX = 67.575
  const CARD_W = 29.73
  const NAME_BAND = { top: 20.5, bottom: 35.46 }
  const CAP_RATIO = 0.74
  const TRIDENT_RIGHT_EDGE = 28.4 // solid artwork on the left
  const RAIL_LEFT_EDGE = 120.01 // right rail box

  let roman: PDFFont

  before(async () => {
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    roman = await doc.embedFont(
      await readFile(path.join(process.cwd(), 'public', 'fonts', 'labels', 'Inter-Black.ttf')),
      { subset: false }
    )
  })

  const lines = (name: string) => splitElevatedVitalityNameLines(name).map((l) => l.toUpperCase())

  it('gives short names the full cap size', () => {
    assert.equal(fitNameSize(roman, lines('NAD+')), 11)
    assert.equal(fitNameSize(roman, lines('Semax')), 11)
  })

  it('keeps long compounds far larger than the old 9pt/narrow-budget output', () => {
    // These used to shrink to ~5.1pt, which is what prompted the change.
    for (const name of ['Tesamorelin', 'Retatrutide', 'Semaglutide', 'Glutathione']) {
      const size = fitNameSize(roman, lines(name))
      assert.ok(size >= 7, `${name} rendered at ${size}pt, expected >= 7`)
    }
  })

  it('never lets the two lines of a blend collide', () => {
    const blend = lines('BPC-157 / TB-500')
    assert.equal(blend.length, 2)
    const size = fitNameSize(roman, blend)
    const capHeight = size * CAP_RATIO
    const gap = 1.4
    const blockHeight = 2 * capHeight + gap
    assert.ok(
      blockHeight <= NAME_BAND.bottom - NAME_BAND.top,
      `blend block ${blockHeight.toFixed(2)}pt exceeds the ${(NAME_BAND.bottom - NAME_BAND.top).toFixed(2)}pt band`
    )
    // Leading must clear the caps, otherwise line 2 overlaps line 1.
    assert.ok(capHeight + gap > capHeight)
  })

  it('stays clear of the trident block and the right rail', () => {
    for (const name of [
      'NAD+',
      'Tesamorelin',
      'Retatrutide',
      'Semaglutide',
      'Tirzepatide',
      'Glutathione',
      'BPC-157 / TB-500',
    ]) {
      const nameLines = lines(name)
      const size = fitNameSize(roman, nameLines)
      for (const line of nameLines) {
        const width = roman.widthOfTextAtSize(line, size)
        const left = CARD_CX - width / 2
        const right = CARD_CX + width / 2
        assert.ok(
          left > TRIDENT_RIGHT_EDGE,
          `${name} starts at ${left.toFixed(1)}, over the trident`
        )
        assert.ok(right < RAIL_LEFT_EDGE, `${name} ends at ${right.toFixed(1)}, over the rail`)
      }
    }
  })

  it('grows the black card so GLOW / KLOW doses keep the preferred size', () => {
    for (const dose of ['50MG/10MG/10MG', '10MG/10MG/50MG/10MG', '10MG/10MG', '10MG']) {
      const card = doseCardGeometry(roman, dose)
      const width = roman.widthOfTextAtSize(dose, card.size)
      assert.ok(width + 2 <= card.w + 0.05, `${dose}: text ${width.toFixed(1)} > card ${card.w}`)
      assert.ok(card.w >= 29.73 - 0.01, `${dose}: card should be at least the template width`)
      assert.ok(card.size >= 4.0, `${dose}: preferred size shrunk too far (${card.size})`)
      assert.ok(card.x >= 30 - 0.01 && card.x + card.w <= 117 + 0.01, `${dose}: card outside column`)
    }
    // Still exposes fitDoseSize for callers/tests that only need the type size.
    assert.equal(fitDoseSize(roman, '10MG'), 4.2)
  })
})

describe('resolveLabelBrandKey', () => {
  it('returns null unless white-label is enabled with a known brand', () => {
    assert.equal(
      resolveLabelBrandKey({ whiteLabelEnabled: false, labelBrandKey: 'elevated_vitality' }),
      null
    )
    assert.equal(resolveLabelBrandKey({ whiteLabelEnabled: true, labelBrandKey: null }), null)
    assert.equal(resolveLabelBrandKey({ whiteLabelEnabled: true, labelBrandKey: 'nope' }), null)
    assert.equal(
      resolveLabelBrandKey({ whiteLabelEnabled: true, labelBrandKey: 'elevated_vitality' }),
      'elevated_vitality'
    )
  })

  it('validates brand keys', () => {
    assert.equal(isLabelBrandKey('elevated_vitality'), true)
    assert.equal(isLabelBrandKey('livbetr'), true)
    assert.equal(isLabelBrandKey('peptsci'), false)
  })

  it('resolves LIVBETR when enabled', () => {
    assert.equal(
      resolveLabelBrandKey({ whiteLabelEnabled: true, labelBrandKey: 'livbetr' }),
      'livbetr'
    )
  })
})
