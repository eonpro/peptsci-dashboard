import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  availableQty,
  isOversold,
  canReserve,
  canTransitionReservation,
  isTerminalReservation,
  aggregateByVariant,
} from '../inventory/reservations-core.ts'

describe('availableQty / isOversold', () => {
  test('available is on-hand minus reserved', () => {
    assert.equal(availableQty(10, 3), 7)
    assert.equal(availableQty(5, 5), 0)
    assert.equal(availableQty(2, 5), -3)
  })

  test('oversold when reserved exceeds on-hand', () => {
    assert.equal(isOversold(2, 5), true)
    assert.equal(isOversold(5, 5), false)
    assert.equal(isOversold(10, 0), false)
  })

  test('treats nullish as zero', () => {
    assert.equal(availableQty(undefined as never, undefined as never), 0)
  })
})

describe('canReserve', () => {
  test('allows when enough available', () => {
    assert.equal(canReserve(10, 2, 5), true)
    assert.equal(canReserve(10, 2, 8), true)
  })
  test('blocks when it would oversell or want is non-positive', () => {
    assert.equal(canReserve(10, 8, 5), false)
    assert.equal(canReserve(10, 2, 0), false)
    assert.equal(canReserve(10, 2, -1), false)
  })
})

describe('reservation transitions', () => {
  test('ACTIVE can release or consume', () => {
    assert.equal(canTransitionReservation('ACTIVE', 'RELEASED'), true)
    assert.equal(canTransitionReservation('ACTIVE', 'CONSUMED'), true)
  })
  test('terminal states cannot transition or self-loop', () => {
    assert.equal(canTransitionReservation('RELEASED', 'ACTIVE'), false)
    assert.equal(canTransitionReservation('CONSUMED', 'RELEASED'), false)
    assert.equal(canTransitionReservation('ACTIVE', 'ACTIVE'), false)
    assert.equal(isTerminalReservation('RELEASED'), true)
    assert.equal(isTerminalReservation('CONSUMED'), true)
    assert.equal(isTerminalReservation('ACTIVE'), false)
  })
})

describe('aggregateByVariant', () => {
  test('sums quantities per variant and sorts by id', () => {
    const out = aggregateByVariant([
      { variantId: 'v2', quantity: 1 },
      { variantId: 'v1', quantity: 2 },
      { variantId: 'v2', quantity: 3 },
    ])
    assert.deepEqual(out, [
      { variantId: 'v1', quantity: 2 },
      { variantId: 'v2', quantity: 4 },
    ])
  })

  test('drops blank ids and non-positive quantities', () => {
    const out = aggregateByVariant([
      { variantId: '', quantity: 5 },
      { variantId: 'v1', quantity: 0 },
      { variantId: 'v1', quantity: -2 },
      { variantId: 'v1', quantity: 3 },
    ])
    assert.deepEqual(out, [{ variantId: 'v1', quantity: 3 }])
  })
})
