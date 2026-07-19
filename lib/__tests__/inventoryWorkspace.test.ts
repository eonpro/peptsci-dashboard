import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePageParams,
  parseBatchScope,
  parseBatchSort,
  parseAdjustmentReason,
  parseDateParam,
  utcDayStart,
  expiringWindow,
  buildMovementSeries,
  buildReasonTotals,
  EXPIRING_WINDOW_DAYS,
} from '../inventory-workspace-core.ts'

describe('parsePageParams', () => {
  test('defaults when params are missing or garbage', () => {
    assert.deepEqual(parsePageParams(null, null), { page: 1, pageSize: 25 })
    assert.deepEqual(parsePageParams('abc', '-3'), { page: 1, pageSize: 25 })
    assert.deepEqual(parsePageParams('0', '0'), { page: 1, pageSize: 25 })
    assert.deepEqual(parsePageParams('2.5', '10.1'), { page: 1, pageSize: 25 })
  })

  test('parses valid integers and clamps pageSize to the max', () => {
    assert.deepEqual(parsePageParams('3', '50'), { page: 3, pageSize: 50 })
    assert.deepEqual(parsePageParams('1', '99999'), { page: 1, pageSize: 500 })
  })

  test('honors custom defaults', () => {
    assert.deepEqual(parsePageParams(null, null, { defaultPageSize: 10 }), {
      page: 1,
      pageSize: 10,
    })
    assert.deepEqual(parsePageParams('1', '300', { maxPageSize: 100 }), {
      page: 1,
      pageSize: 100,
    })
  })
})

describe('parseBatchScope', () => {
  test('accepts every workspace scope, case-insensitively', () => {
    for (const s of ['ACTIVE', 'EXPIRING', 'EXPIRED', 'RECEIVED', 'DEPLETED', 'VOIDED', 'ALL']) {
      assert.equal(parseBatchScope(s), s)
      assert.equal(parseBatchScope(s.toLowerCase()), s)
    }
  })

  test('falls back to ALL for unknown values', () => {
    assert.equal(parseBatchScope('bogus'), 'ALL')
    assert.equal(parseBatchScope(null), 'ALL')
    assert.equal(parseBatchScope(undefined), 'ALL')
  })
})

describe('parseBatchSort', () => {
  test('accepts known keys and directions', () => {
    assert.deepEqual(parseBatchSort('bud', 'asc'), { key: 'bud', dir: 'asc' })
    assert.deepEqual(parseBatchSort('qtyOnHand', 'desc'), { key: 'qtyOnHand', dir: 'desc' })
  })

  test('defaults to createdAt desc for unknown input', () => {
    assert.deepEqual(parseBatchSort('evil; DROP TABLE', 'sideways'), {
      key: 'createdAt',
      dir: 'desc',
    })
    assert.deepEqual(parseBatchSort(null, null), { key: 'createdAt', dir: 'desc' })
  })
})

describe('parseAdjustmentReason', () => {
  test('accepts every ledger reason', () => {
    for (const r of ['RECEIPT', 'ORDER_FULFILLMENT', 'RETURN', 'MANUAL_ADJUSTMENT', 'DAMAGE', 'AUDIT']) {
      assert.equal(parseAdjustmentReason(r), r)
      assert.equal(parseAdjustmentReason(r.toLowerCase()), r)
    }
  })

  test('returns undefined for unknown values', () => {
    assert.equal(parseAdjustmentReason('WHATEVER'), undefined)
    assert.equal(parseAdjustmentReason(null), undefined)
  })
})

describe('parseDateParam', () => {
  test('parses ISO dates', () => {
    assert.equal(parseDateParam('2026-07-01')?.toISOString(), '2026-07-01T00:00:00.000Z')
  })

  test('returns undefined for empty or invalid', () => {
    assert.equal(parseDateParam(''), undefined)
    assert.equal(parseDateParam('not-a-date'), undefined)
    assert.equal(parseDateParam(null), undefined)
  })
})

describe('expiringWindow', () => {
  test('spans today through +EXPIRING_WINDOW_DAYS at UTC midnight', () => {
    const now = new Date('2026-07-18T15:30:00Z')
    const { start, end } = expiringWindow(now)
    assert.equal(start.toISOString(), '2026-07-18T00:00:00.000Z')
    assert.equal(
      end.getTime() - start.getTime(),
      EXPIRING_WINDOW_DAYS * 86_400_000
    )
  })

  test('utcDayStart truncates to the UTC day', () => {
    assert.equal(
      utcDayStart(new Date('2026-07-18T23:59:59Z')).toISOString(),
      '2026-07-18T00:00:00.000Z'
    )
  })
})

describe('buildMovementSeries', () => {
  const now = new Date('2026-07-18T12:00:00Z')

  test('zero-fills every day in the window', () => {
    const series = buildMovementSeries([], 7, now)
    assert.equal(series.length, 7)
    assert.equal(series[0].date, '2026-07-12')
    assert.equal(series[6].date, '2026-07-18')
    assert.ok(series.every((p) => p.inbound === 0 && p.outbound === 0 && p.net === 0))
  })

  test('buckets inbound and outbound by UTC day', () => {
    const rows = [
      { createdAt: '2026-07-18T03:00:00Z', delta: 100, reason: 'RECEIPT' },
      { createdAt: '2026-07-18T20:00:00Z', delta: -8, reason: 'ORDER_FULFILLMENT' },
      { createdAt: '2026-07-17T10:00:00Z', delta: -2, reason: 'DAMAGE' },
      // Outside the window — ignored:
      { createdAt: '2026-07-01T10:00:00Z', delta: 999, reason: 'RECEIPT' },
    ]
    const series = buildMovementSeries(rows, 3, now)
    assert.equal(series.length, 3)
    const day17 = series.find((p) => p.date === '2026-07-17')!
    const day18 = series.find((p) => p.date === '2026-07-18')!
    assert.deepEqual(
      { inbound: day17.inbound, outbound: day17.outbound, net: day17.net },
      { inbound: 0, outbound: 2, net: -2 }
    )
    assert.deepEqual(
      { inbound: day18.inbound, outbound: day18.outbound, net: day18.net },
      { inbound: 100, outbound: 8, net: 92 }
    )
  })
})

describe('buildReasonTotals', () => {
  test('aggregates per reason and sorts by total volume', () => {
    const rows = [
      { createdAt: '2026-07-18T00:00:00Z', delta: 100, reason: 'RECEIPT' },
      { createdAt: '2026-07-18T00:00:00Z', delta: 50, reason: 'RECEIPT' },
      { createdAt: '2026-07-18T00:00:00Z', delta: -5, reason: 'ORDER_FULFILLMENT' },
      { createdAt: '2026-07-18T00:00:00Z', delta: -3, reason: 'ORDER_FULFILLMENT' },
      { createdAt: '2026-07-18T00:00:00Z', delta: -1, reason: 'DAMAGE' },
      { createdAt: '2026-07-18T00:00:00Z', delta: 2, reason: 'RETURN' },
    ]
    const totals = buildReasonTotals(rows)
    assert.equal(totals[0].reason, 'RECEIPT')
    assert.deepEqual(totals[0], { reason: 'RECEIPT', inbound: 150, outbound: 0 })
    assert.deepEqual(
      totals.find((t) => t.reason === 'ORDER_FULFILLMENT'),
      { reason: 'ORDER_FULFILLMENT', inbound: 0, outbound: 8 }
    )
    assert.deepEqual(
      totals.find((t) => t.reason === 'RETURN'),
      { reason: 'RETURN', inbound: 2, outbound: 0 }
    )
  })

  test('empty input yields empty totals', () => {
    assert.deepEqual(buildReasonTotals([]), [])
  })
})
