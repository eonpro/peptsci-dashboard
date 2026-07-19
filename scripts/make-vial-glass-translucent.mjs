/**
 * Dev utility: make the blank vial's GLASS body translucent so the card
 * background shows through like a real glass vial.
 *
 * Regions (as % of image height, matching components/shop/ProductVial.tsx):
 *   0%–13%    blue cap + crimp seal  → untouched
 *   13%–44.4% glass shoulder/neck    → translucent body
 *   44.4%–87.6% printed label band   → untouched (must stay readable)
 *   87.6%–100% glass base            → translucent body
 *
 * Within glass rows, alpha is scaled by tone: bright specular highlights and
 * dark edge lines keep their opacity (they define the vial's shape); flat
 * mid-tone "glass fill" drops to ~35% so the background reads through.
 *
 * Usage: node scripts/make-vial-glass-translucent.mjs public/vial/vial-blank.png
 */
import sharp from 'sharp'

const CAP_END = 0.13
const LABEL_TOP = 0.444
const LABEL_BOTTOM = 0.876

const BODY_MIN_ALPHA = 0.32 // flattest glass keeps at least this
const smooth = (t) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

async function run(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  for (let y = 0; y < height; y++) {
    const fy = y / height
    const isGlass = (fy >= CAP_END && fy < LABEL_TOP) || fy >= LABEL_BOTTOM
    if (!isGlass) continue
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      const a = data[i + 3]
      if (a === 0) continue
      const b = (data[i] + data[i + 1] + data[i + 2]) / 3
      // Highlights (bright streaks) and edges/shadows (dark lines) stay strong.
      const highlight = smooth((b - 185) / 60)
      const edge = smooth((95 - b) / 70)
      const keep = Math.max(highlight, edge)
      const scale = BODY_MIN_ALPHA + (1 - BODY_MIN_ALPHA) * keep
      data[i + 3] = Math.round(a * scale)
    }
  }

  const tmp = file.replace(/\.png$/, '.tmp.png')
  await sharp(data, { raw: { width, height, channels } }).png().toFile(tmp)
  const { renameSync } = await import('node:fs')
  renameSync(tmp, file)
  console.log(`done: ${file} (${width}x${height})`)
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/make-vial-glass-translucent.mjs <file.png>')
  process.exit(1)
}
for (const f of files) await run(f)
