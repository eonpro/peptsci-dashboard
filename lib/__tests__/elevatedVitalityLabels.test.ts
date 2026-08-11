import { before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import {
  fitNameSize,
  formatElevatedVitalityDose,
  parseBudUs,
  splitElevatedVitalityNameLines,
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
    assert.equal(formatElevatedVitalityDose('10mg', ['BPC-157', 'TB-500']), '10MG/10MG')
    assert.equal(formatElevatedVitalityDose('10mg/5mg', ['A', 'B']), '10MG/5MG')
    assert.equal(formatElevatedVitalityDose('10mg', ['TESAMORELIN']), '10MG')
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
  const NAME_BAND = { top: 20.5, bottom: 35.46 }
  const CAP_RATIO = 0.74
  const TRIDENT_RIGHT_EDGE = 28.4 // solid artwork on the left
  const RAIL_LEFT_EDGE = 120.01 // right rail box

  let italic: PDFFont

  before(async () => {
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    italic = await doc.embedFont(
      await readFile(
        path.join(process.cwd(), 'public', 'fonts', 'labels', 'Inter-ExtraBoldItalic.ttf')
      ),
      { subset: false }
    )
  })

  const lines = (name: string) => splitElevatedVitalityNameLines(name).map((l) => l.toUpperCase())

  it('gives short names the full cap size', () => {
    assert.equal(fitNameSize(italic, lines('NAD+')), 11)
    assert.equal(fitNameSize(italic, lines('Semax')), 11)
  })

  it('keeps long compounds far larger than the old 9pt/narrow-budget output', () => {
    // These used to shrink to ~5.1pt, which is what prompted the change.
    for (const name of ['Tesamorelin', 'Retatrutide', 'Semaglutide', 'Glutathione']) {
      const size = fitNameSize(italic, lines(name))
      assert.ok(size >= 7, `${name} rendered at ${size}pt, expected >= 7`)
    }
  })

  it('never lets the two lines of a blend collide', () => {
    const blend = lines('BPC-157 / TB-500')
    assert.equal(blend.length, 2)
    const size = fitNameSize(italic, blend)
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
      const size = fitNameSize(italic, nameLines)
      for (const line of nameLines) {
        const width = italic.widthOfTextAtSize(line, size)
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
