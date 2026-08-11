import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isCffFont } from '../labels/embed-font'
import { SOFIA_PRO_REGULAR_B64 } from '../labels/embeddedAssets'
import { SOFIA_PRO_SEMIBOLD_B64 } from '../labels/livbetrEmbeddedAssets'

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts', 'labels')
const font = (name: string) => readFile(path.join(FONT_DIR, name))

describe('isCffFont', () => {
  test('flags the OpenType/CFF label fonts that must not be subsetted', async () => {
    for (const name of [
      'SofiaPro-SemiBold.otf',
      'SofiaPro-Bold.otf',
      'NeuethingSans-MediumExpanded.otf',
    ]) {
      assert.equal(isCffFont(await font(name)), true, `${name} is CFF`)
    }
  })

  test('leaves TrueType label fonts subsettable', async () => {
    for (const name of [
      'SofiaPro-Regular.ttf',
      'AmericanTypewriter-Condensed.ttf',
      'AmericanTypewriter-CondensedBold.ttf',
      'Inter-Black.ttf',
      'NeuethingSans-MediumExpanded.ttf',
    ]) {
      assert.equal(isCffFont(await font(name)), false, `${name} is TrueType`)
    }
  })

  test('classifies the bundled base64 fallbacks too', () => {
    // Whatever flavour these are, the check must agree with their sfnt tag so
    // the fallback path never subsets a CFF font.
    for (const b64 of [SOFIA_PRO_REGULAR_B64, SOFIA_PRO_SEMIBOLD_B64]) {
      const bytes = Buffer.from(b64, 'base64')
      const tag = bytes.subarray(0, 4).toString('latin1')
      assert.equal(isCffFont(bytes), tag === 'OTTO', `tag ${tag}`)
    }
  })

  test('does not crash on empty or truncated input', () => {
    assert.equal(isCffFont(new Uint8Array()), false)
    assert.equal(isCffFont(new Uint8Array([0x4f, 0x54])), false)
  })
})
