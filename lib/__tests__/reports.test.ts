import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  revenueSummary,
  revenueByMonth,
  topProducts,
  arAgingSummary,
  fulfillmentSla,
  forecastNextPeriod,
  lowStockSummary,
  type SaleLike,
} from '../reports/core.ts'

const sale = (over: Partial<SaleLike>): SaleLike => ({
  date: new Date('2026-03-15T00:00:00.000Z'),
  product: 'Semaglutide',
  revenue: 100,
  cogs: 40,
  units: 1,
  ...over,
})

describe('revenueSummary', () => {
  test('totals revenue/cogs/profit/margin/units/orders', () => {
    const r = revenueSummary([sale({}), sale({ revenue: 200, cogs: 60, units: 2 })])
    assert.equal(r.revenue, 300)
    assert.equal(r.cogs, 100)
    assert.equal(r.profit, 200)
    assert.equal(r.units, 3)
    assert.equal(r.orders, 2)
    assert.ok(Math.abs(r.marginPct - 66.67) < 0.01)
  })
  test('filters by date range', () => {
    const r = revenueSummary(
      [sale({ date: new Date('2026-01-01') }), sale({ date: new Date('2026-06-01') })],
      new Date('2026-05-01'),
      new Date('2026-07-01')
    )
    assert.equal(r.orders, 1)
  })
})

describe('revenueByMonth', () => {
  test('groups ascending by YYYY-MM', () => {
    const series = revenueByMonth([
      sale({ date: new Date('2026-02-10T00:00:00Z'), revenue: 50, cogs: 20 }),
      sale({ date: new Date('2026-01-10T00:00:00Z'), revenue: 100, cogs: 30 }),
      sale({ date: new Date('2026-02-20T00:00:00Z'), revenue: 25, cogs: 5 }),
    ])
    assert.deepEqual(
      series.map((s) => s.month),
      ['2026-01', '2026-02']
    )
    assert.equal(series[1].revenue, 75)
    assert.equal(series[1].profit, 50)
  })
})

describe('topProducts', () => {
  test('ranks by revenue and limits', () => {
    const tp = topProducts(
      [
        sale({ product: 'A', revenue: 100, cogs: 50 }),
        sale({ product: 'B', revenue: 300, cogs: 100 }),
        sale({ product: 'A', revenue: 50, cogs: 10 }),
      ],
      1
    )
    assert.equal(tp.length, 1)
    assert.equal(tp[0].product, 'B')
    assert.equal(tp[0].revenue, 300)
  })
})

describe('arAgingSummary', () => {
  const now = new Date('2026-06-01T00:00:00.000Z')
  test('buckets balances by days past due', () => {
    const ar = arAgingSummary(
      [
        { amountDue: 100, dueDate: new Date('2026-06-15') }, // current
        { amountDue: 200, dueDate: new Date('2026-05-20') }, // ~12d → net30
        { amountDue: 300, dueDate: new Date('2026-03-20') }, // ~73d → net90
        { amountDue: 0, dueDate: new Date('2026-01-01') }, // skipped (paid)
      ],
      now
    )
    assert.equal(ar.current, 100)
    assert.equal(ar.net30, 200)
    assert.equal(ar.net90, 300)
    assert.equal(ar.total, 600)
    assert.equal(ar.invoiceCount, 3)
    assert.equal(ar.overdueCount, 2)
  })
})

describe('fulfillmentSla', () => {
  test('computes avg/median hours and within-SLA pct', () => {
    const base = new Date('2026-06-01T00:00:00.000Z')
    const sla = fulfillmentSla(
      [
        { createdAt: base, shippedAt: new Date('2026-06-02T00:00:00.000Z') }, // 24h
        { createdAt: base, shippedAt: new Date('2026-06-04T00:00:00.000Z') }, // 72h
        { createdAt: base, shippedAt: null }, // unshipped
      ],
      48
    )
    assert.equal(sla.totalOrders, 3)
    assert.equal(sla.shippedOrders, 2)
    assert.equal(sla.unshippedOrders, 1)
    assert.equal(sla.avgHoursToShip, 48)
    assert.equal(sla.withinSlaPct, 50)
  })
})

describe('forecastNextPeriod', () => {
  test('empty → 0, single → itself', () => {
    assert.equal(forecastNextPeriod([]), 0)
    assert.equal(forecastNextPeriod([42]), 42)
  })
  test('rising series forecasts above the last SMA, never negative', () => {
    const f = forecastNextPeriod([10, 20, 30])
    assert.ok(f > 20)
    assert.ok(forecastNextPeriod([5, 0, 0]) >= 0)
  })
})

describe('lowStockSummary', () => {
  test('classifies out/low/ok', () => {
    const s = lowStockSummary([
      { available: 0, reorderPoint: 5 },
      { available: 3, reorderPoint: 5 },
      { available: 50, reorderPoint: 5 },
    ])
    assert.deepEqual(s, { outCount: 1, lowCount: 1, okCount: 1 })
  })
})
