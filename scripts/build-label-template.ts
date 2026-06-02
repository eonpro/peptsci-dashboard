/**
 * Build the PeptSci label template PNG from the source artwork SVG.
 *
 * The source SVG (`public/labels/PEPTSCI LABEL SAMPLE.svg`) is the authoritative
 * label artwork supplied by PeptSci. Its viewBox is `0 0 144 54` — i.e. the
 * OL4891LP label in PDF points (2.0" x 0.75"). All *static* brand elements
 * (PeptSci logo + molecule, divider, `BUD:`, `RUO`, two-tone dose box with
 * `99%HPLC`, the rotated `PROVIDER USE ONLY...` warning, and `BATCH:`) are baked
 * in. The *dynamic* fields (BUD date digits, dose, barcode) are `display:none`
 * so they do NOT render — leaving a clean blank template that the label engine
 * composites and overlays at print time.
 *
 * We render at ~1440 DPI (2880px wide for a 2" label) so the raster background is
 * indistinguishable from vector at print size, while the barcode and dynamic
 * text are drawn as crisp PDF vectors on top.
 *
 * Run: `npx tsx scripts/build-label-template.ts`
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const SRC = path.join(process.cwd(), 'public', 'labels', 'PEPTSCI LABEL SAMPLE.svg')
const OUT = path.join(process.cwd(), 'public', 'labels', 'peptsci-label-template.png')
const RENDER_WIDTH_PX = 2880 // 144pt @ 1440 DPI

function main() {
  const svg = readFileSync(SRC, 'utf8')
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: RENDER_WIDTH_PX },
    // Transparent so the label can sit on any stock; the engine draws on white.
    background: 'rgba(0,0,0,0)',
  })
  const png = resvg.render().asPng()
  writeFileSync(OUT, png)
  // eslint-disable-next-line no-console
  console.log(`Wrote ${OUT} (${png.length} bytes, ${RENDER_WIDTH_PX}px wide)`)
}

main()
