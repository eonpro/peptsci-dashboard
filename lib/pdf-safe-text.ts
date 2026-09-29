/**
 * Make arbitrary user-entered text safe to draw with a pdf-lib Standard-14 font.
 *
 * Standard-14 fonts only support WinAnsi (CP-1252). `drawText` /
 * `widthOfTextAtSize` THROW on any glyph outside it — emoji, CJK, decomposed or
 * non-Latin accents, and even a plain "\n" or tab — which 500s the whole
 * document. Patient and clinic names are free text, so every string that reaches
 * a Standard-14 font goes through here first.
 *
 * Anything WinAnsi can already draw is left alone (é, ñ, em dash, curly quotes,
 * ™, …). Letters with accents outside WinAnsi fall back to their base letter
 * ("Nguyễn" → "Nguyen") rather than printing "?", control characters become
 * spaces, and whatever is still unrepresentable becomes a single "?" so widths
 * stay valid.
 *
 * @module lib/pdf-safe-text
 */

/** The CP-1252 "extras" WinAnsi maps into 0x80–0x9F (€ … ‰ Š Œ Ž ‘ ’ “ ” • – — ™ š œ ž Ÿ). */
const WIN_ANSI_EXTRAS: ReadonlySet<number> = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
])

/** True when a Standard-14 font can draw this code point. */
function isWinAnsi(codePoint: number): boolean {
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0xa0 && codePoint <= 0xff) ||
    WIN_ANSI_EXTRAS.has(codePoint)
  )
}

/** Typographic punctuation → plain ASCII, for documents that print ASCII only. */
const ASCII_PUNCTUATION: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2018\u2019\u201A\u2032]/g, "'"],
  [/[\u201C\u201D\u201E\u2033]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
  [/\u2026/g, '...'],
  [/\u2122/g, '(TM)'],
  [/\u00AE/g, '(R)'],
  [/\u00A0/g, ' '],
]

/** Letters with no Unicode decomposition that names commonly contain. */
const LETTER_FALLBACK: Readonly<Record<string, string>> = {
  '\u0141': 'L',
  '\u0142': 'l',
  '\u0110': 'D',
  '\u0111': 'd',
  '\u0131': 'i',
}

/** C0 + DEL + C1 controls: WinAnsi has no glyph for them (drawText throws). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g

/** Combining diacritical marks, left over after compatibility decomposition. */
const COMBINING_MARKS = /[\u0300-\u036F]/g

/** What to draw for a character WinAnsi can't: its base letter(s), nothing, or "?". */
function fallbackFor(char: string): string {
  const direct = LETTER_FALLBACK[char]
  if (direct) return direct
  // A lone combining accent (decomposed "é" = e + ́) has no glyph of its own —
  // dropping it leaves the base letter the previous character already drew.
  const base = char.normalize('NFKD').replace(COMBINING_MARKS, '')
  for (const c of base) if (!isWinAnsi(c.codePointAt(0)!)) return '?'
  return base
}

export interface PdfSafeTextOptions {
  /**
   * Also flatten typographic punctuation (curly quotes, en/em dash, …, ™, ®) to
   * ASCII. The pick list and packing slip have always printed ASCII only; leave
   * this off where the glyphs are wanted (invoices).
   */
  asciiPunctuation?: boolean
}

export function pdfSafeText(
  input: string | null | undefined,
  options: PdfSafeTextOptions = {}
): string {
  if (!input) return ''
  let text = input
  if (options.asciiPunctuation) {
    for (const [pattern, replacement] of ASCII_PUNCTUATION) text = text.replace(pattern, replacement)
  }
  text = text.replace(CONTROL_CHARS, ' ')
  // Array.from walks code points, so an emoji is one "?" rather than two.
  return Array.from(text, (char) => (isWinAnsi(char.codePointAt(0)!) ? char : fallbackFor(char))).join('')
}
