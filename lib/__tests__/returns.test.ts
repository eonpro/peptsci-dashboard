import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatRmaNumber,
  canTransition,
  nextStatuses,
  isTerminalReturnStatus,
  isRestockEligible,
} from '../returns/core.ts'

describe('formatRmaNumber', () => {
  test('formats RMA-YYYYMMDD-NNN with zero-padded sequence', () => {
    const d = new Date('2026-06-28T12:00:00Z')
    assert.equal(formatRmaNumber(d, 1), 'RMA-20260628-001')
    assert.equal(formatRmaNumber(d, 42), 'RMA-20260628-042')
    assert.equal(formatRmaNumber(d, 123), 'RMA-20260628-123')
  })

  test('clamps non-positive sequence to 1', () => {
    const d = new Date('2026-01-05T00:00:00Z')
    assert.equal(formatRmaNumber(d, 0), 'RMA-20260105-001')
    assert.equal(formatRmaNumber(d, -3), 'RMA-20260105-001')
  })
})

describe('canTransition', () => {
  test('allows valid forward moves', () => {
    assert.equal(canTransition('REQUESTED', 'APPROVED'), true)
    assert.equal(canTransition('APPROVED', 'RECEIVED'), true)
    assert.equal(canTransition('RECEIVED', 'RESTOCKED'), true)
    assert.equal(canTransition('RESTOCKED', 'REFUNDED'), true)
  })

  test('rejects invalid / backward moves and self-loops', () => {
    assert.equal(canTransition('REQUESTED', 'RESTOCKED'), false)
    assert.equal(canTransition('DELIVERED' as never, 'CLOSED'), false)
    assert.equal(canTransition('RECEIVED', 'REQUESTED'), false)
    assert.equal(canTransition('APPROVED', 'APPROVED'), false)
  })

  test('CLOSED is reachable from any non-terminal state', () => {
    for (const s of ['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'REFUNDED'] as const) {
      assert.equal(canTransition(s, 'CLOSED'), true, `from ${s}`)
    }
  })

  test('CLOSED is terminal', () => {
    assert.equal(isTerminalReturnStatus('CLOSED'), true)
    assert.equal(nextStatuses('CLOSED').length, 0)
    assert.equal(canTransition('CLOSED', 'REFUNDED'), false)
  })
})

describe('isRestockEligible', () => {
  test('GOOD + received/inspected + not restocked is eligible', () => {
    assert.equal(isRestockEligible({ status: 'RECEIVED', condition: 'GOOD', restocked: false }), true)
    assert.equal(isRestockEligible({ status: 'INSPECTED', condition: 'GOOD', restocked: false }), true)
  })

  test('ineligible when already restocked, damaged/missing, or not yet received', () => {
    assert.equal(isRestockEligible({ status: 'RECEIVED', condition: 'GOOD', restocked: true }), false)
    assert.equal(isRestockEligible({ status: 'RECEIVED', condition: 'DAMAGED', restocked: false }), false)
    assert.equal(isRestockEligible({ status: 'RECEIVED', condition: 'MISSING', restocked: false }), false)
    assert.equal(isRestockEligible({ status: 'APPROVED', condition: 'GOOD', restocked: false }), false)
    assert.equal(isRestockEligible({ status: 'REQUESTED', condition: 'GOOD', restocked: false }), false)
  })
})
