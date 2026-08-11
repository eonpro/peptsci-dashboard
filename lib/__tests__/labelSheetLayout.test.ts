import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  OL4891LP,
  labelsPerSheet,
  planLabelSheets,
  type SheetGeometry,
} from '../labels/sheet-layout'

/** The stock every brand prints on: 2" x 0.75", 3 columns x 12 rows. */
const g: SheetGeometry = OL4891LP

const group = (name: string, quantity: number) => ({ req: name, quantity })

describe('OL4891LP geometry', () => {
  test('is a 36-label sheet', () => {
    assert.equal(g.cols * g.rows, 36)
    assert.equal(labelsPerSheet(g), 36)
  })
})

describe('planLabelSheets packing', () => {
  test('packs five 3-vial products onto a single sheet', () => {
    const { pageCount, placements } = planLabelSheets(
      [
        group('Semaglutide', 3),
        group('Tirzepatide', 3),
        group('BPC-157', 3),
        group('TB-500', 3),
        group('Retatrutide', 3),
      ],
      g
    )
    assert.equal(placements.length, 15)
    assert.equal(pageCount, 1, 'fifteen labels must not span five sheets')
    assert.ok(
      placements.every((p) => p.pageIndex === 0),
      'every label belongs on the first sheet'
    )
  })

  test('fills all 36 slots before starting a new sheet', () => {
    const { pageCount, placements } = planLabelSheets([group('A', 36)], g)
    assert.equal(pageCount, 1)
    assert.equal(placements.at(-1)?.slot, 35)

    const spill = planLabelSheets([group('A', 37)], g)
    assert.equal(spill.pageCount, 2)
    assert.equal(spill.placements.at(-1)?.pageIndex, 1)
    assert.equal(spill.placements.at(-1)?.slot, 0)
  })

  test('lets a product straddle a sheet boundary instead of wasting slots', () => {
    const { pageCount, placements } = planLabelSheets([group('A', 35), group('B', 3)], g)
    assert.equal(pageCount, 2)
    const b = placements.filter((p) => p.req === 'B')
    assert.deepEqual(
      b.map((p) => ({ page: p.pageIndex, slot: p.slot })),
      [
        { page: 0, slot: 35 },
        { page: 1, slot: 0 },
        { page: 1, slot: 1 },
      ]
    )
  })

  test('keeps each product contiguous and in the order given', () => {
    const { placements } = planLabelSheets([group('A', 2), group('B', 2), group('C', 1)], g)
    assert.deepEqual(
      placements.map((p) => p.req),
      ['A', 'A', 'B', 'B', 'C']
    )
    assert.deepEqual(
      placements.map((p) => p.slot),
      [0, 1, 2, 3, 4]
    )
  })

  test('skips zero, negative, and fractional-down quantities', () => {
    const { pageCount, placements } = planLabelSheets(
      [group('A', 0), group('B', -5), group('C', 2.9)],
      g
    )
    assert.deepEqual(
      placements.map((p) => p.req),
      ['C', 'C']
    )
    assert.equal(pageCount, 1)
  })

  test('reports no sheets when there is nothing to print', () => {
    const { pageCount, placements } = planLabelSheets([], g)
    assert.equal(pageCount, 0)
    assert.equal(placements.length, 0)
  })
})

describe('planLabelSheets coordinates', () => {
  test('runs left to right, then top to bottom', () => {
    const { placements } = planLabelSheets([group('A', 4)], g)
    const [s0, s1, s2, s3] = placements

    // First row: same y, stepping right by the horizontal pitch.
    assert.equal(s0.x, g.leftMargin)
    assert.equal(s1.x, g.leftMargin + g.hPitch)
    assert.equal(s2.x, g.leftMargin + 2 * g.hPitch)
    assert.equal(s1.y, s0.y)
    assert.equal(s2.y, s0.y)

    // Fourth label wraps to the second row, back at the left column.
    assert.equal(s3.x, g.leftMargin)
    assert.equal(s3.y, s0.y - g.vPitch)
  })

  test('measures y from the sheet top down to the label bottom edge', () => {
    const { placements } = planLabelSheets([group('A', 1)], g)
    assert.equal(placements[0].y, g.sheetHeight - g.topMargin - g.labelHeight)
  })

  test('the last slot lands inside the sheet', () => {
    const { placements } = planLabelSheets([group('A', 36)], g)
    const last = placements[35]
    assert.equal(last.x, g.leftMargin + 2 * g.hPitch)
    assert.equal(last.y, g.sheetHeight - g.topMargin - 11 * g.vPitch - g.labelHeight)
    assert.ok(last.y >= 0, 'bottom row must not fall off the page')
    assert.ok(last.x + g.labelWidth <= g.sheetWidth, 'right column must fit the sheet')
  })
})
