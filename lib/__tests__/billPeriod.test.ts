import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  localYmd,
  isOrderInBillPeriod,
  applyBillPeriodSelection,
  billPeriodBounds,
} from '../invoicing/bill-period'

describe('localYmd', () => {
  it('formats a Date as YYYY-MM-DD in local time', () => {
    const d = new Date(2026, 7, 11, 15, 30, 0) // Aug 11 2026 local
    assert.equal(localYmd(d), '2026-08-11')
  })
})

describe('isOrderInBillPeriod', () => {
  const mid = new Date(2026, 7, 15, 12, 0, 0).toISOString()

  it('includes when no bounds', () => {
    assert.equal(isOrderInBillPeriod(mid), true)
  })

  it('includes orders on the from and to edges', () => {
    assert.equal(isOrderInBillPeriod(mid, '2026-08-15', '2026-08-15'), true)
    assert.equal(isOrderInBillPeriod(mid, '2026-08-01', '2026-08-31'), true)
  })

  it('excludes before from and after to', () => {
    assert.equal(isOrderInBillPeriod(mid, '2026-08-16', null), false)
    assert.equal(isOrderInBillPeriod(mid, null, '2026-08-14'), false)
  })
})

describe('applyBillPeriodSelection', () => {
  const orders = [
    { id: 'a', createdAt: new Date(2026, 7, 5).toISOString() },
    { id: 'b', createdAt: new Date(2026, 7, 15).toISOString() },
    { id: 'c', createdAt: new Date(2026, 7, 25).toISOString() },
  ]

  it('selects all when no period set', () => {
    const next = applyBillPeriodSelection(orders, null, null)
    assert.deepEqual(
      next.map((o) => o.selected),
      [true, true, true]
    )
  })

  it('selects only orders in range', () => {
    const next = applyBillPeriodSelection(orders, '2026-08-10', '2026-08-20')
    assert.deepEqual(
      next.map((o) => ({ id: o.id, selected: o.selected })),
      [
        { id: 'a', selected: false },
        { id: 'b', selected: true },
        { id: 'c', selected: false },
      ]
    )
  })
})

describe('billPeriodBounds', () => {
  it('returns nulls when empty', () => {
    assert.deepEqual(billPeriodBounds(null, null), { periodStart: null, periodEnd: null })
  })

  it('builds inclusive local day bounds', () => {
    const { periodStart, periodEnd } = billPeriodBounds('2026-08-01', '2026-08-31')
    assert.ok(periodStart)
    assert.ok(periodEnd)
    assert.equal(localYmd(periodStart!), '2026-08-01')
    assert.equal(localYmd(periodEnd!), '2026-08-31')
    assert.equal(periodStart!.getHours(), 0)
    assert.equal(periodEnd!.getHours(), 23)
  })
})
