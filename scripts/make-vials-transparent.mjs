/**
 * Dev utility: remove the white studio background from the demo vial PNGs.
 *
 * Flood-fills near-white pixels connected to the image border and makes them
 * transparent, so the white label ON the vial (not border-connected) is kept.
 * Pixels near the threshold get a feathered alpha to avoid hard halos, then
 * the image is trimmed to content.
 *
 * Usage: node scripts/make-vials-transparent.mjs public/demo-products/*.png
 */
import sharp from 'sharp'

const THRESHOLD = 246 // min RGB for a pixel to count as "background white"
const FEATHER = 10 // brightness range below threshold that gets partial alpha

async function makeTransparent(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  const isWhite = (i) =>
    data[i] >= THRESHOLD && data[i + 1] >= THRESHOLD && data[i + 2] >= THRESHOLD

  // BFS flood fill from all border pixels.
  const visited = new Uint8Array(width * height)
  const queue = []
  const push = (x, y) => {
    const p = y * width + x
    if (visited[p]) return
    const i = p * channels
    if (!isWhite(i)) return
    visited[p] = 1
    queue.push(p)
  }
  for (let x = 0; x < width; x++) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y++) {
    push(0, y)
    push(width - 1, y)
  }
  while (queue.length > 0) {
    const p = queue.pop()
    const x = p % width
    const y = (p / width) | 0
    if (x > 0) push(x - 1, y)
    if (x < width - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < height - 1) push(x, y + 1)
  }

  // Apply transparency; feather pixels adjacent to the removed background.
  for (let p = 0; p < width * height; p++) {
    const i = p * channels
    if (visited[p]) {
      data[i + 3] = 0
      continue
    }
    // Feather: near-white pixels touching the removed region get partial alpha.
    const x = p % width
    const y = (p / width) | 0
    const nearBg =
      (x > 0 && visited[p - 1]) ||
      (x < width - 1 && visited[p + 1]) ||
      (y > 0 && visited[p - width]) ||
      (y < height - 1 && visited[p + width])
    if (nearBg) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
      if (brightness > THRESHOLD - FEATHER) {
        data[i + 3] = Math.round(
          255 * Math.min(1, (THRESHOLD - brightness + FEATHER) / (FEATHER * 2))
        )
      }
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .trim()
    .png()
    .toFile(file.replace(/\.png$/, '.tmp.png'))

  const { renameSync } = await import('node:fs')
  renameSync(file.replace(/\.png$/, '.tmp.png'), file)
  console.log(`done: ${file}`)
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/make-vials-transparent.mjs <file.png> ...')
  process.exit(1)
}
for (const f of files) await makeTransparent(f)
