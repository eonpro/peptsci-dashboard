import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { computeAssayGeometry } from '../coa-geometry'

describe('computeAssayGeometry', () => {
  it('computes percent of the component claim (5.93mg vs 5mg is 118.6%, not vs 15mg)', () => {
    const ipa = computeAssayGeometry(5.93, 5)
    assert.equal(ipa.percentOfClaim, 118.6)
    assert.equal(ipa.labelClaimMg, 5)
    assert.equal(ipa.measuredMg, 5.93)

    const tesa = computeAssayGeometry(9.97, 10)
    assert.equal(tesa.percentOfClaim, 99.7)

    const wronglyVialTotal = computeAssayGeometry(5.93, 15)
    assert.notEqual(wronglyVialTotal.percentOfClaim, 118.6)
  })

  it('keeps 100% on-axis and still shows a 118.6% result instead of clamping it to 105', () => {
    const g = computeAssayGeometry(5.93, 5)
    assert.ok(g.axisMax >= 118.6, `axisMax ${g.axisMax} should include 118.6`)
    assert.ok(g.axisMin <= 100)
    assert.ok(g.resultX > g.targetX)
    // Clamped-to-105 would pin the marker on the right edge (x = 644).
    assert.ok(g.resultX < 644, `resultX ${g.resultX} should sit inside the axis, not on the 105% wall`)
  })

  it('keeps the default 95–105 band for in-range assays', () => {
    const g = computeAssayGeometry(50.2, 50)
    assert.equal(g.axisMin, 95)
    assert.equal(g.axisMax, 105)
    assert.equal(g.percentOfClaim, 100.4)
  })
})
