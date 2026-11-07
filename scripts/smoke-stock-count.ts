/**
 * Real-DB smoke test for the stock count (preview → apply), driven through the
 * real route handlers. Seeds a small catalog with batches and reservations
 * into an EMPTY scratch database, then checks on-hand, batch moves,
 * adjustments, batch events, the audit snapshot, replay of stock that moved
 * after the count time, the STOCK_CHANGED guard, new-batch creation,
 * idempotency and payload validation.
 *
 * Usage (scratch DB with migrations applied — never the dev or prod DB):
 *   env -i PATH="$PATH" HOME="$HOME" DATABASE_URL=postgresql://…/peptsci_smoke \
 *     npx tsx scripts/smoke-stock-count.ts
 * With Clerk unconfigured the routes take the local dev-admin bypass.
 */
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { assertLocalOrExplicitOverride } from '../lib/db-url'
import { prisma } from '../lib/prisma'
import { recordLabelsPrinted } from '../lib/inventory-batches'
import { POST as previewRoute } from '../app/api/admin/inventory/stock-count/preview/route'
import { POST as applyRoute } from '../app/api/admin/inventory/stock-count/route'
import { toApplyLines, type StockCountPreview } from '../lib/inventory/stock-count-core'

assertLocalOrExplicitOverride('smoke-stock-count')
if (!prisma) throw new Error('DATABASE_URL is not set')
const db = prisma

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

async function previewResponse(body: Record<string, unknown>) {
  return previewRoute(post('/api/admin/inventory/stock-count/preview', body))
}

async function preview(
  text: string,
  zeroUnlisted = false,
  countedAt?: string
): Promise<StockCountPreview> {
  const res = await previewResponse({ text, zeroUnlisted, countedAt })
  assert.equal(res.status, 200, await res.clone().text())
  return (await res.json()).preview
}

async function apply(body: unknown) {
  const res = await applyRoute(post('/api/admin/inventory/stock-count', body))
  return { status: res.status, body: await res.json() }
}

function utcDay(offsetDays: number): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays))
}

const isoDay = (offsetDays: number) => utcDay(offsetDays).toISOString().slice(0, 10)

interface SeedVariant {
  sku: string
  dose: string
  onHand: number
  reserved?: number
  batches?: Array<{ n: string; budInDays: number; qty: number }>
}

async function seedProduct(name: string, variants: SeedVariant[]) {
  const product = await db.product.create({ data: { name, status: 'ACTIVE' } })
  for (const v of variants) {
    const row = await db.productVariant.create({
      data: {
        productId: product.id,
        sku: v.sku,
        dose: v.dose,
        unitCost: 10,
        srp: 50,
        inventoryOnHand: v.onHand,
        inventoryReserved: v.reserved ?? 0,
      },
    })
    for (const b of v.batches ?? []) {
      await db.inventoryBatch.create({
        data: {
          batchNumber: b.n,
          variantId: row.id,
          productName: name,
          dose: v.dose,
          bud: utcDay(b.budInDays),
          qtyReceived: b.qty,
          qtyOnHand: b.qty,
          status: b.qty > 0 ? 'RECEIVED' : 'DEPLETED',
        },
      })
    }
  }
}

async function variant(sku: string) {
  return db.productVariant.findUniqueOrThrow({
    where: { sku },
    include: { batches: { orderBy: { bud: 'asc' } } },
  })
}

async function main() {
  assert.equal(await db.product.count(), 0, 'expected an empty scratch database')

  await seedProduct('BPC-157', [
    {
      sku: 'BC5',
      dose: '5.0mg',
      onHand: 140,
      reserved: 4,
      batches: [
        { n: 'BPC5-A', budInDays: 60, qty: 100 },
        { n: 'BPC5-B', budInDays: 150, qty: 40 },
      ],
    },
    { sku: 'BC10', dose: '10.0mg', onHand: 5 },
  ])
  await seedProduct('Semaglutide', [
    { sku: 'SM5', dose: '5.0mg', onHand: 0 },
    {
      sku: 'SM10',
      dose: '10.0mg',
      onHand: 12,
      batches: [{ n: 'SEM10-A', budInDays: 200, qty: 12 }],
    },
  ])
  await seedProduct('Tirzepatide', [
    { sku: 'TR10', dose: '10.0mg', onHand: 0 },
    {
      sku: 'TR30',
      dose: '30.0mg',
      onHand: 50,
      reserved: 3,
      batches: [
        { n: 'TIR30-OLD', budInDays: -10, qty: 6 },
        { n: 'TIR30-A', budInDays: 90, qty: 44 },
      ],
    },
  ])
  await seedProduct('TB-500', [
    { sku: 'TB500-5', dose: '5 mg', onHand: 2, batches: [{ n: 'TB5-A', budInDays: 30, qty: 2 }] },
  ])
  await seedProduct('KPV', [{ sku: 'KPV10', dose: '10.0mg', onHand: 0 }])
  await seedProduct('FOXO4', [{ sku: 'F410', dose: '10.0mg', onHand: 3 }])

  // 1. Ambiguous until the size is given.
  const draft = `"BPC-157 5mg: 126 vials
BPC-157 10mg: 5
GLP-SM 10mg: 15
Tirzepatide: 40
TB-500 5mg: 10 vials KPV: 7"`
  const first = await preview(draft)
  assert.equal(first.canApply, false)
  assert.deepEqual(
    first.lines.filter((l) => l.status === 'ambiguous').map((l) => l.entry?.label),
    ['Tirzepatide']
  )
  assert.deepEqual(
    first.unlisted.map((u) => [u.sku, u.onHand]),
    [['F410', 3]]
  )

  // 2. Fixed → apply. KPV has no batch, so give it a BUD for a new one.
  const countedAt = new Date().toISOString()
  const fixedText = draft.replace('Tirzepatide: 40', 'Tirzepatide 30mg: 40')
  const fixed = await preview(fixedText, false, countedAt)
  assert.equal(fixed.canApply, true, JSON.stringify(fixed.lines, null, 2))
  const kpvLine = fixed.lines.find((l) => l.variant?.sku === 'KPV10')
  assert.equal(kpvLine?.unbatched, 7)
  const tr30 = fixed.lines.find((l) => l.variant?.sku === 'TR30')
  assert.deepEqual(
    tr30?.batchChanges.map((c) => [c.batchNumber, c.from, c.to]),
    [
      ['TIR30-OLD', 6, 0],
      ['TIR30-A', 44, 40],
    ]
  )
  const kpvBud = isoDay(365)
  const applied = await apply({
    lines: toApplyLines(fixed).map((l) =>
      l.variantId === kpvLine?.variant?.variantId ? { ...l, newBatchBud: kpvBud } : l
    ),
    countedAt,
    note: 'smoke',
  })
  assert.equal(applied.status, 201, JSON.stringify(applied.body))
  const result = applied.body.result
  assert.deepEqual(
    [result.lines, result.changed, result.unchanged, result.netChange, result.batchesCreated],
    [6, 5, 1, -14 + 0 + 3 - 10 + 8 + 7, 1]
  )
  // BC10 is unchanged but its 5 units never had a batch — reported, not hidden.
  assert.deepEqual(
    result.unbatched.map((u: { sku: string; units: number }) => [u.sku, u.units]),
    [['BC10', 5]]
  )

  const bc5 = await variant('BC5')
  assert.equal(bc5.inventoryOnHand, 126)
  assert.equal(bc5.inventoryReserved, 4, 'reservations are untouched')
  assert.deepEqual(
    bc5.batches.map((b) => [b.batchNumber, b.qtyOnHand, b.status]),
    [
      ['BPC5-A', 86, 'RECEIVED'],
      ['BPC5-B', 40, 'RECEIVED'],
    ]
  )
  const tr = await variant('TR30')
  assert.equal(tr.inventoryOnHand, 40)
  assert.deepEqual(
    tr.batches.map((b) => [b.batchNumber, b.qtyOnHand, b.status]),
    [
      ['TIR30-OLD', 0, 'DEPLETED'],
      ['TIR30-A', 40, 'RECEIVED'],
    ]
  )
  assert.equal((await variant('SM10')).batches[0].qtyOnHand, 15)
  assert.equal((await variant('TB500-5')).batches[0].qtyOnHand, 10)
  const kpv = await variant('KPV10')
  assert.equal(kpv.inventoryOnHand, 7)
  assert.equal(kpv.batches.length, 1)
  assert.equal(kpv.batches[0].qtyOnHand, 7)
  assert.equal(kpv.batches[0].bud.toISOString().slice(0, 10), kpvBud)
  assert.equal((await variant('F410')).inventoryOnHand, 3, 'products not on the list are untouched')

  const adjustments = await db.inventoryAdjustment.findMany({ where: { reason: 'AUDIT' } })
  assert.equal(adjustments.length, 5, 'one AUDIT adjustment per changed on-hand (BC10 unchanged)')
  assert.ok(
    adjustments.every(
      (a) =>
        /^Stock count \w{3} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M ET/.test(a.note ?? '') &&
        a.note?.includes(`ref ${result.countId.slice(0, 8)}: counted`)
    ),
    adjustments.map((a) => a.note).join('\n')
  )
  const events = await db.inventoryBatchEvent.findMany({ where: { type: 'ADJUSTED' } })
  assert.deepEqual(
    events.map((e) => e.delta).sort((a, b) => (a ?? 0) - (b ?? 0)),
    [-14, -6, -4, 3, 8]
  )
  const audit = await db.auditLog.findFirstOrThrow({
    where: { entity: 'InventoryCount', entityId: result.countId },
  })
  assert.equal(audit.action, 'stock_count_applied')
  assert.equal((audit.metadata as { lines: unknown[] }).lines.length, 6)

  // 3. Re-previewing the same count is a no-op (its own AUDIT rows aren't replayed).
  const again = await preview(fixedText, false, countedAt)
  assert.deepEqual(
    again.lines.map((l) => l.status),
    ['unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged']
  )

  // 4. An order ships 3 vials after the count. Entering the same count as of
  //    its original time replays the draw; entering it as "now" would undo it.
  await recordLabelsPrinted(bc5.batches[0].id, 3, { label: 'smoke-fulfillment' })
  const asCounted = (await preview('BPC-157 5mg: 126', false, countedAt)).lines[0]
  assert.deepEqual(
    [asCounted.status, asCounted.sinceCount, asCounted.target, asCounted.before],
    ['unchanged', -3, 123, 123]
  )
  const asNow = (await preview('BPC-157 5mg: 126')).lines[0]
  assert.deepEqual([asNow.status, asNow.sinceCount, asNow.delta], ['ready', 0, 3])

  // 5. Stock moves between preview and apply → 409, nothing written.
  const stale = await preview('BPC-157 5mg: 120')
  await db.productVariant.update({
    where: { sku: 'BC5' },
    data: { inventoryOnHand: { decrement: 1 } },
  })
  const conflict = await apply({ lines: toApplyLines(stale) })
  assert.equal(conflict.status, 409, JSON.stringify(conflict.body))
  assert.equal(conflict.body.code, 'STOCK_CHANGED')
  assert.deepEqual(
    conflict.body.conflicts.map((c: { sku: string; expectedOnHand: number; onHand: number }) => [
      c.sku,
      c.expectedOnHand,
      c.onHand,
    ]),
    [['BC5', 123, 122]]
  )
  assert.equal((await variant('BC5')).inventoryOnHand, 122)
  assert.equal(await db.inventoryAdjustment.count({ where: { reason: 'AUDIT' } }), 5)

  // 6. Full count: products not on the list become explicit zero lines.
  const full = await preview('BPC-157 5mg: 125', true)
  assert.deepEqual(
    full.lines
      .filter((l) => l.source === 'unlisted')
      .map((l) => [l.variant?.sku, l.before, l.counted]),
    [
      ['BC10', 5, 0],
      ['F410', 3, 0],
      ['SM10', 15, 0],
      ['TR30', 40, 0],
      ['KPV10', 7, 0],
      ['TB500-5', 10, 0],
    ]
  )

  // 7. Payload validation.
  assert.equal((await apply({ lines: [] })).status, 400)
  const line = toApplyLines(stale)[0]
  assert.equal((await apply({ lines: [line, line] })).status, 400)
  const tomorrow = utcDay(1).toISOString()
  const longAgo = utcDay(-120).toISOString()
  assert.equal((await apply({ lines: [line], countedAt: tomorrow })).status, 400)
  assert.equal((await apply({ lines: [line], countedAt: longAgo })).status, 400)
  assert.equal((await previewResponse({ text: 'KPV: 1', countedAt: tomorrow })).status, 400)
  assert.equal((await apply({ lines: [{ ...line, newBatchBud: isoDay(-1) }] })).status, 400)

  console.log('✔ stock count smoke passed')
}

main()
  .then(async () => {
    await db.$disconnect()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    await db.$disconnect()
    process.exit(1)
  })
