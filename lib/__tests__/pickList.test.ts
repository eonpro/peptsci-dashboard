import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  planLineDraws,
  buildPickList,
  type PickableBatch,
  type PickListItemInput,
} from '../fulfillment/pick-list-core.ts'

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('planLineDraws', () => {
  test('draws oldest BUD first across multiple batches', () => {
    const batches: PickableBatch[] = [
      { batchNumber: 'B2', bud: d('2027-06-01'), qtyOnHand: 5 },
      { batchNumber: 'B1', bud: d('2027-01-01'), qtyOnHand: 3 },
    ]
    const { draws, shortfall } = planLineDraws(batches, 4)
    assert.equal(shortfall, 0)
    assert.deepEqual(draws, [
      { batchNumber: 'B1', bud: '2027-01-01', qty: 3 },
      { batchNumber: 'B2', bud: '2027-06-01', qty: 1 },
    ])
  })

  test('reports shortfall when stock is insufficient', () => {
    const batches: PickableBatch[] = [{ batchNumber: 'B1', bud: d('2027-01-01'), qtyOnHand: 2 }]
    const { draws, shortfall } = planLineDraws(batches, 5)
    assert.equal(shortfall, 3)
    assert.deepEqual(draws, [{ batchNumber: 'B1', bud: '2027-01-01', qty: 2 }])
  })

  test('ignores empty batches and breaks ties by batch number', () => {
    const batches: PickableBatch[] = [
      { batchNumber: 'B9', bud: d('2027-01-01'), qtyOnHand: 0 },
      { batchNumber: 'BB', bud: d('2027-01-01'), qtyOnHand: 2 },
      { batchNumber: 'BA', bud: d('2027-01-01'), qtyOnHand: 2 },
    ]
    const { draws } = planLineDraws(batches, 3)
    assert.deepEqual(draws, [
      { batchNumber: 'BA', bud: '2027-01-01', qty: 2 },
      { batchNumber: 'BB', bud: '2027-01-01', qty: 1 },
    ])
  })
})

describe('buildPickList', () => {
  const items: PickListItemInput[] = [
    { variantId: 'v1', productName: 'Semaglutide', dose: '10mg', sku: 'SEMA-10', quantity: 2 },
    { variantId: 'v2', productName: 'BPC-157', dose: '5mg', sku: 'BPC-5', quantity: 3 },
    { variantId: 'v1', productName: 'Semaglutide', dose: '10mg', sku: 'SEMA-10', quantity: 1 },
  ]
  const batchesByVariant = new Map<string, PickableBatch[]>([
    ['v1', [{ batchNumber: 'S1', bud: d('2027-03-01'), qtyOnHand: 10 }]],
    ['v2', [{ batchNumber: 'P1', bud: d('2027-02-01'), qtyOnHand: 1 }]],
  ])

  test('aggregates repeated variants and totals units', () => {
    const pl = buildPickList(items, batchesByVariant)
    assert.equal(pl.lines.length, 2)
    const sema = pl.lines.find((l) => l.variantId === 'v1')!
    assert.equal(sema.quantityNeeded, 3)
    assert.deepEqual(sema.draws, [{ batchNumber: 'S1', bud: '2027-03-01', qty: 3 }])
    assert.equal(pl.totalUnits, 6)
  })

  test('flags shortfall and not fully allocatable', () => {
    const pl = buildPickList(items, batchesByVariant)
    const bpc = pl.lines.find((l) => l.variantId === 'v2')!
    assert.equal(bpc.shortfall, 2)
    assert.equal(pl.totalShortfall, 2)
    assert.equal(pl.fullyAllocatable, false)
  })

  test('missing variant batches yields full shortfall', () => {
    const pl = buildPickList(
      [{ variantId: 'v3', productName: 'Tirzepatide', dose: '15mg', quantity: 4 }],
      new Map()
    )
    assert.equal(pl.lines[0].shortfall, 4)
    assert.equal(pl.lines[0].draws.length, 0)
    assert.equal(pl.fullyAllocatable, false)
  })

  test('sorts lines by product then dose and skips non-positive quantities', () => {
    const pl = buildPickList(
      [
        { variantId: 'b', productName: 'Zinc', dose: '1mg', quantity: 1 },
        { variantId: 'a', productName: 'Alpha', dose: '2mg', quantity: 0 },
        { variantId: 'c', productName: 'Alpha', dose: '1mg', quantity: 2 },
      ],
      new Map()
    )
    assert.deepEqual(
      pl.lines.map((l) => l.variantId),
      ['c', 'b']
    )
  })
})
