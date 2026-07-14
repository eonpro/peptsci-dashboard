import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { monthBounds } from '../invoicing/statement'

describe('monthBounds (America/New_York)', () => {
  it('rejects malformed month keys', () => {
    assert.equal(monthBounds('2026-13'), null)
    assert.equal(monthBounds('2026-00'), null)
    assert.equal(monthBounds('garbage'), null)
    assert.equal(monthBounds('2026-1'), null)
  })

  it('starts a winter month at 05:00 UTC (EST midnight)', () => {
    const b = monthBounds('2026-01')
    assert.ok(b)
    assert.equal(b.start.toISOString(), '2026-01-01T05:00:00.000Z')
    assert.equal(b.end.toISOString(), '2026-02-01T05:00:00.000Z')
  })

  it('starts a summer month at 04:00 UTC (EDT midnight)', () => {
    const b = monthBounds('2026-07')
    assert.ok(b)
    assert.equal(b.start.toISOString(), '2026-07-01T04:00:00.000Z')
    assert.equal(b.end.toISOString(), '2026-08-01T04:00:00.000Z')
  })

  it('spans a DST transition correctly (March: EST start, EDT end)', () => {
    const b = monthBounds('2026-03')
    assert.ok(b)
    assert.equal(b.start.toISOString(), '2026-03-01T05:00:00.000Z')
    assert.equal(b.end.toISOString(), '2026-04-01T04:00:00.000Z')
  })

  it('rolls December into January of the next year', () => {
    const b = monthBounds('2025-12')
    assert.ok(b)
    assert.equal(b.start.toISOString(), '2025-12-01T05:00:00.000Z')
    assert.equal(b.end.toISOString(), '2026-01-01T05:00:00.000Z')
  })

  it('keeps a late-evening ET sale inside its ET month', () => {
    const b = monthBounds('2026-01')
    assert.ok(b)
    // Jan 31, 2026 8 PM ET = Feb 1 01:00 UTC — must still be January (ET).
    const lateJanSale = new Date('2026-02-01T01:00:00.000Z')
    assert.ok(lateJanSale >= b.start && lateJanSale < b.end)
  })
})
