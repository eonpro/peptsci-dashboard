import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import { pdfSafeText } from '../pdf-safe-text.ts'

async function helvetica(): Promise<PDFFont> {
  const doc = await PDFDocument.create()
  return doc.embedFont(StandardFonts.Helvetica)
}

function canDraw(font: PDFFont, text: string): boolean {
  try {
    font.widthOfTextAtSize(text, 10)
    return true
  } catch {
    return false
  }
}

describe('pdfSafeText', () => {
  test('passes ASCII and Latin-1 names through untouched', () => {
    assert.equal(pdfSafeText('Jane Doe'), 'Jane Doe')
    assert.equal(pdfSafeText('José Núñez-Müller'), 'José Núñez-Müller')
    assert.equal(pdfSafeText("O'Brien & Sons #4"), "O'Brien & Sons #4")
  })

  test('keeps punctuation WinAnsi can draw (em dash, curly quotes, ™, €)', () => {
    for (const s of ['Order #1 \u2014 2026-09-01', '\u201CQuoted\u201D \u2018it\u2019', 'Brand\u2122 \u20AC5', 'a\u2026']) {
      assert.equal(pdfSafeText(s), s)
    }
  })

  test('drops accents on letters outside WinAnsi instead of printing "?"', () => {
    assert.equal(pdfSafeText('Nguy\u1EC5n V\u0103n An'), 'Nguyen Van An')
    assert.equal(pdfSafeText('\u0141ukasz \u0110or\u0111evi\u0107'), 'Lukasz Dordevic')
    assert.equal(pdfSafeText('\uFF2A\uFF41\uFF4E\uFF45'), 'Jane') // fullwidth
    assert.equal(pdfSafeText('Nguye\u0302\u0303n'), 'Nguyen') // decomposed accents
  })

  test('turns line breaks and other control characters into spaces', () => {
    assert.equal(pdfSafeText('Jane\nDoe'), 'Jane Doe')
    assert.equal(pdfSafeText('Jane\r\nDoe\tJr'), 'Jane  Doe Jr')
    assert.equal(pdfSafeText('a\u0085b\u007Fc\u0000d'), 'a b c d')
  })

  test('replaces every other unrepresentable character with a single "?"', () => {
    assert.equal(pdfSafeText('Ann \uD83D\uDE42'), 'Ann ?') // emoji = one code point
    assert.equal(pdfSafeText('\u5F20\u4F1F'), '??') // CJK
    assert.equal(pdfSafeText('lone \uD800 surrogate'), 'lone ? surrogate')
  })

  test('is empty for null, undefined and empty input', () => {
    assert.equal(pdfSafeText(null), '')
    assert.equal(pdfSafeText(undefined), '')
    assert.equal(pdfSafeText(''), '')
  })

  test('asciiPunctuation flattens typographic characters for ASCII-only documents', () => {
    const ascii = { asciiPunctuation: true }
    assert.equal(pdfSafeText('\u201CQuoted\u201D \u2018text\u2019', ascii), '"Quoted" \'text\'')
    assert.equal(pdfSafeText('Order #1 \u2014 2026\u201309\u201301', ascii), 'Order #1 - 2026-09-01')
    assert.equal(pdfSafeText('Wait\u2026', ascii), 'Wait...')
    assert.equal(pdfSafeText('Brand\u2122 Lab\u00AE', ascii), 'Brand(TM) Lab(R)')
    assert.equal(pdfSafeText('a\u00A0b', ascii), 'a b')
    // …and still makes everything else drawable.
    assert.equal(pdfSafeText('Jane\nDoe \uD83D\uDE42', ascii), 'Jane Doe ?')
  })
})

describe('pdfSafeText vs the real Standard-14 encoder', () => {
  test('output can always be drawn (never throws), for every BMP code point', async () => {
    const font = await helvetica()
    const bad: string[] = []
    for (const opts of [{}, { asciiPunctuation: true }]) {
      for (let cp = 0; cp <= 0xffff; cp++) {
        const text = pdfSafeText(`x${String.fromCodePoint(cp)}y`, opts)
        if (!canDraw(font, text)) {
          bad.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
          if (bad.length >= 10) break
        }
      }
    }
    for (const cp of [0x1f642, 0x1f600, 0x10000, 0x20000, 0x10ffff]) {
      assert.ok(canDraw(font, pdfSafeText(String.fromCodePoint(cp))), `astral U+${cp.toString(16)}`)
    }
    assert.deepEqual(bad, [], `code points that still throw in Helvetica: ${bad.join(', ')}`)
  })

  test('leaves a character alone exactly when Helvetica can already draw it', async () => {
    const font = await helvetica()
    const wrong: string[] = []
    for (let cp = 0; cp <= 0xffff; cp++) {
      const char = String.fromCodePoint(cp)
      const kept = pdfSafeText(char) === char
      if (kept !== canDraw(font, char)) {
        wrong.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
        if (wrong.length >= 10) break
      }
    }
    assert.deepEqual(wrong, [], `sanitizer disagrees with pdf-lib for: ${wrong.join(', ')}`)
  })
})
