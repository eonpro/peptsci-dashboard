/**
 * Font embedding for label PDFs.
 *
 * @pdf-lib/fontkit's CFF subsetter re-indexes glyphs without rewriting the
 * encoding, so a subsetted OpenType/CFF (`.otf`) font prints the wrong glyphs —
 * "BPC-157 5mg" comes out as `!"#$%&` — and throws a RangeError when the
 * document ends up using no glyph at all. TrueType subsetting is correct and
 * keeps the PDF small, so subset TrueType only and embed CFF fonts whole.
 *
 * @module lib/labels/embed-font
 */

import type { PDFDocument, PDFFont } from 'pdf-lib'

/**
 * True when the sfnt wrapper is `OTTO`, i.e. OpenType with CFF (PostScript)
 * outlines. TrueType-flavoured files start with `0x00010000` or `true`.
 */
export function isCffFont(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x4f && // O
    bytes[1] === 0x54 && // T
    bytes[2] === 0x54 && // T
    bytes[3] === 0x4f // O
  )
}

/** Embed a label font, subsetting only when that is safe (see module note). */
export function embedLabelFont(doc: PDFDocument, bytes: Uint8Array): Promise<PDFFont> {
  return doc.embedFont(bytes, { subset: !isCffFont(bytes) })
}
