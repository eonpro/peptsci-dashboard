import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getDefaultProtocol, getProtocolForName } from '../content/peptide-protocols'

describe('getProtocolForName', () => {
  it('resolves BPC/TB blend and singles', () => {
    const blend = getProtocolForName('BPC-157 / TB-500 Blend')
    assert.ok(blend)
    assert.equal(blend!.recommendedBacWaterMl, 2)
    assert.equal(blend!.defaultDoseMcg, 250)
    assert.match(blend!.daily.range, /250/)

    const bpc = getProtocolForName('BPC-157')
    assert.ok(bpc)
    assert.equal(bpc!.defaultDoseMcg, 250)

    assert.equal(getProtocolForName('Totally Unknown Peptide XYZ'), null)
  })

  it('provides usable defaults when no authored protocol exists', () => {
    const d = getDefaultProtocol(10)
    assert.equal(d.recommendedBacWaterMl, 2)
    assert.ok(d.defaultDoseMcg > 0)
  })
})
