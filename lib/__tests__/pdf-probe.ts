import { inflateSync } from 'node:zlib'

/** Unicode for bytes 0x80–0x9F in WinAnsi (CP-1252); the rest of 0x00–0xFF is Latin-1. */
const WIN_ANSI_HIGH =
  '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F' +
  '\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178'

function decodeWinAnsi(bytes: Buffer): string {
  let out = ''
  for (const byte of bytes) {
    out += byte >= 0x80 && byte <= 0x9f ? WIN_ANSI_HIGH[byte - 0x80] : String.fromCharCode(byte)
  }
  return out
}

/**
 * Test helper: every string a pdf-lib page shows with a Standard-14 font.
 *
 * pdf-lib writes `drawText` output as a hex string inside a Flate-compressed
 * content stream (`<4A616E6520446F65> Tj`). Inflating each stream and decoding
 * those operands lets tests assert what a generated PDF actually says, without
 * pulling in a PDF text-extraction dependency.
 */
export function pdfShownStrings(pdf: Buffer | Uint8Array): string[] {
  const raw = Buffer.from(pdf).toString('latin1')
  const shown: string[] = []
  // pdf-lib ends stream data with exactly "\nendstream"; compressed bytes can
  // themselves end in \r, so it must not be consumed as part of the delimiter.
  const streams = /stream\r?\n([\s\S]*?)\nendstream/g
  let stream: RegExpExecArray | null
  while ((stream = streams.exec(raw))) {
    let content: string
    try {
      content = inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1')
    } catch {
      continue // fonts / images / uncompressed streams carry no text operators
    }
    const show = /<([0-9A-Fa-f]*)>\s*Tj/g
    let op: RegExpExecArray | null
    while ((op = show.exec(content))) {
      shown.push(decodeWinAnsi(Buffer.from(op[1], 'hex')))
    }
  }
  return shown
}
