import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getMonographForName, normalizeKey } from '../content/peptide-monographs'

describe('getMonographForName', () => {
  it('resolves previously unmatched live-catalog names', () => {
    assert.ok(getMonographForName('5-Amino-1MQ'))
    assert.ok(getMonographForName('Tesamorelin and Ipamorelin'))
    assert.equal(normalizeKey('5-Amino-1MQ'), '5-amino-1mq')
  })

  it('prefers Glow/Klow over plain BPC+TB when GHK is present', () => {
    const glow = getMonographForName('GHK-Cu and BPC-157 and TB-500')
    const klow = getMonographForName('GHK-Cu and BPC-157 and TB-500 and KPV')
    const blend = getMonographForName('BPC-157 and TB-500')
    assert.ok(glow)
    assert.ok(klow)
    assert.ok(blend)
    assert.notEqual(glow, blend)
    assert.notEqual(klow, glow)
    assert.match(glow!.overview[0], /Glow/i)
    assert.match(klow!.overview[0], /KLOW/i)
  })

  it('still resolves core catalog compounds', () => {
    for (const name of [
      'LL-37',
      'Ipamorelin',
      'Kisspeptin',
      'Sermorelin',
      'AOD-9604',
      'Thymosin alpha-1',
      'DSIP',
    ]) {
      assert.ok(getMonographForName(name), `missing monograph for ${name}`)
    }
  })
})
