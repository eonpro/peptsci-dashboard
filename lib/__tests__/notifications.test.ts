import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  paginate,
  computeHasMore,
  buildPaginatedResult,
  isDedupable,
  dailySourceId,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../notifications/core.ts'

describe('paginate', () => {
  test('defaults to page 1 and the default page size', () => {
    assert.deepEqual(paginate(undefined, undefined), {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    })
  })

  test('computes skip from page and size', () => {
    const r = paginate(3, 10)
    assert.equal(r.page, 3)
    assert.equal(r.pageSize, 10)
    assert.equal(r.skip, 20)
    assert.equal(r.take, 10)
  })

  test('clamps non-positive and non-finite inputs to safe defaults', () => {
    assert.deepEqual(paginate(0, 0), { page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0, take: DEFAULT_PAGE_SIZE })
    assert.deepEqual(paginate(-5, -1), { page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0, take: DEFAULT_PAGE_SIZE })
    assert.equal(paginate(NaN, NaN).page, 1)
  })

  test('caps page size at MAX_PAGE_SIZE', () => {
    assert.equal(paginate(1, 5000).pageSize, MAX_PAGE_SIZE)
    assert.equal(paginate(1, 5000).take, MAX_PAGE_SIZE)
  })

  test('floors fractional page/size', () => {
    const r = paginate(2.9, 10.7)
    assert.equal(r.page, 2)
    assert.equal(r.pageSize, 10)
    assert.equal(r.skip, 10)
  })
})

describe('computeHasMore', () => {
  test('true when more rows remain past the current page', () => {
    assert.equal(computeHasMore(1, 20, 50), true)
    assert.equal(computeHasMore(2, 20, 50), true)
  })

  test('false on the last page', () => {
    assert.equal(computeHasMore(3, 20, 50), false)
    assert.equal(computeHasMore(1, 20, 20), false)
    assert.equal(computeHasMore(1, 20, 0), false)
  })
})

describe('buildPaginatedResult', () => {
  test('carries fields through and derives hasMore', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    const result = buildPaginatedResult({
      notifications: rows,
      total: 5,
      unreadCount: 2,
      page: 1,
      pageSize: 2,
    })
    assert.deepEqual(result.notifications, rows)
    assert.equal(result.total, 5)
    assert.equal(result.unreadCount, 2)
    assert.equal(result.page, 1)
    assert.equal(result.pageSize, 2)
    assert.equal(result.hasMore, true)
  })

  test('hasMore false when total fits on the page', () => {
    const result = buildPaginatedResult({
      notifications: [{ id: 'a' }],
      total: 1,
      unreadCount: 0,
      page: 1,
      pageSize: 20,
    })
    assert.equal(result.hasMore, false)
  })
})

describe('isDedupable', () => {
  test('requires both sourceType and sourceId', () => {
    assert.equal(isDedupable('cron:fedex-tracking', 'order_1'), true)
    assert.equal(isDedupable('cron:fedex-tracking', undefined), false)
    assert.equal(isDedupable(undefined, 'order_1'), false)
    assert.equal(isDedupable(null, null), false)
    assert.equal(isDedupable('', 'order_1'), false)
  })
})

describe('dailySourceId', () => {
  test('combines entity id with a UTC yyyymmdd stamp', () => {
    const d = new Date(Date.UTC(2026, 5, 28, 23, 59)) // Jun 28 2026 UTC
    assert.equal(dailySourceId('variant_42', d), 'variant_42:20260628')
  })

  test('same entity + same day produces a stable key (dedup-friendly)', () => {
    const a = new Date(Date.UTC(2026, 0, 5, 1))
    const b = new Date(Date.UTC(2026, 0, 5, 22))
    assert.equal(dailySourceId('batch_x', a), dailySourceId('batch_x', b))
  })

  test('different days produce different keys', () => {
    const a = new Date(Date.UTC(2026, 0, 5))
    const b = new Date(Date.UTC(2026, 0, 6))
    assert.notEqual(dailySourceId('batch_x', a), dailySourceId('batch_x', b))
  })
})
