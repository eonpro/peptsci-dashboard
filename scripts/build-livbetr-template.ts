/**
 * Rasterize LIVBETR empty SVG → template PNG.
 * Static type is mostly outlined; RUO remains live Neuething text.
 *
 * Run: npx tsx scripts/build-livbetr-template.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'public/labels/clients/livbetr/livbetr-label-empty.svg')
const OUT = path.join(ROOT, 'public/labels/clients/livbetr/livbetr-label-template.png')
const FONT_DIR = path.join(ROOT, 'public/fonts/labels')

let svg = readFileSync(SRC, 'utf8')
if (!svg.includes('id="label-bg"')) {
  svg = svg.replace(
    /<\/defs>/,
    `</defs>\n  <rect id="label-bg" x="0" y="0" width="129.1" height="47.27" fill="#ffffff"/>`
  )
}
svg = svg.replaceAll(
  "NeuethingSans-MediumExpanded, 'Neuething Sans'",
  'NeuethingSans-MediumExpanded'
)
svg = svg.replaceAll("SofiaPro-Regular, 'Sofia Pro'", 'SofiaPro-Regular')

const resvg = new Resvg(svg, {
  fitTo: { mode: 'zoom', value: 20 },
  font: {
    fontFiles: [
      path.join(FONT_DIR, 'NeuethingSans-MediumExpanded.ttf'),
      path.join(FONT_DIR, 'NeuethingSans-MediumExpanded.otf'),
      path.join(FONT_DIR, 'SofiaPro-Regular.ttf'),
      path.join(FONT_DIR, 'SofiaPro-SemiBold.otf'),
    ],
    loadSystemFonts: false,
    defaultFontFamily: 'NeuethingSans-MediumExpanded',
  },
})
const png = resvg.render().asPng()
writeFileSync(OUT, png)
console.log(`wrote ${OUT} (${png.length} bytes)`)
