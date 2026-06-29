import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mapFedExStatusToShipping,
  isTerminalShippingStatus,
  TERMINAL_STATUSES,
  describeShippingStatus,
  trackingTimeline,
  isExceptionStatus,
} from '../shipping/fedex-status.ts'

describe('mapFedExStatusToShipping', () => {
  test('maps delivery + out-for-delivery', () => {
    assert.equal(mapFedExStatusToShipping('DL'), 'DELIVERED')
    assert.equal(mapFedExStatusToShipping('OD'), 'OUT_FOR_DELIVERY')
  })

  test('maps in-transit family to IN_TRANSIT', () => {
    for (const code of ['PU', 'IT', 'IN', 'AR', 'DP', 'HL']) {
      assert.equal(mapFedExStatusToShipping(code), 'IN_TRANSIT', `code ${code}`)
    }
  })

  test('maps label creation and exceptions and cancellation', () => {
    assert.equal(mapFedExStatusToShipping('OC'), 'LABEL_CREATED')
    assert.equal(mapFedExStatusToShipping('DE'), 'EXCEPTION')
    assert.equal(mapFedExStatusToShipping('SE'), 'EXCEPTION')
    assert.equal(mapFedExStatusToShipping('CA'), 'CANCELLED')
  })

  test('is case-insensitive', () => {
    assert.equal(mapFedExStatusToShipping('dl'), 'DELIVERED')
  })

  test('returns null for unknown / empty codes (leave status untouched)', () => {
    assert.equal(mapFedExStatusToShipping('ZZ'), null)
    assert.equal(mapFedExStatusToShipping(''), null)
    assert.equal(mapFedExStatusToShipping(null), null)
    assert.equal(mapFedExStatusToShipping(undefined), null)
  })
})

describe('isTerminalShippingStatus', () => {
  test('DELIVERED and CANCELLED are terminal', () => {
    assert.equal(isTerminalShippingStatus('DELIVERED'), true)
    assert.equal(isTerminalShippingStatus('CANCELLED'), true)
    assert.equal(TERMINAL_STATUSES.has('DELIVERED'), true)
  })

  test('transit states are not terminal', () => {
    assert.equal(isTerminalShippingStatus('IN_TRANSIT'), false)
    assert.equal(isTerminalShippingStatus('OUT_FOR_DELIVERY'), false)
    assert.equal(isTerminalShippingStatus('LABEL_CREATED'), false)
    assert.equal(isTerminalShippingStatus(null), false)
    assert.equal(isTerminalShippingStatus(undefined), false)
  })
})

describe('describeShippingStatus', () => {
  test('maps known statuses to friendly labels', () => {
    assert.equal(describeShippingStatus('IN_TRANSIT'), 'In transit')
    assert.equal(describeShippingStatus('DELIVERED'), 'Delivered')
    assert.equal(describeShippingStatus('OUT_FOR_DELIVERY'), 'Out for delivery')
  })

  test('falls back gracefully', () => {
    assert.equal(describeShippingStatus(null), 'Awaiting shipment')
    assert.equal(describeShippingStatus(undefined), 'Awaiting shipment')
    assert.equal(describeShippingStatus('WEIRD'), 'WEIRD')
  })
})

describe('trackingTimeline', () => {
  test('marks steps up to current as reached, current flagged', () => {
    const steps = trackingTimeline('IN_TRANSIT')
    const byStatus = Object.fromEntries(steps.map((s) => [s.status, s]))
    assert.equal(byStatus.LABEL_CREATED.reached, true)
    assert.equal(byStatus.IN_TRANSIT.reached, true)
    assert.equal(byStatus.IN_TRANSIT.current, true)
    assert.equal(byStatus.OUT_FOR_DELIVERY.reached, false)
    assert.equal(byStatus.DELIVERED.reached, false)
  })

  test('delivered marks all steps reached', () => {
    const steps = trackingTimeline('DELIVERED')
    assert.ok(steps.every((s) => s.reached))
    assert.equal(steps[steps.length - 1].current, true)
  })

  test('off-path/unknown statuses only reach the label step at most', () => {
    for (const s of ['EXCEPTION', 'CANCELLED', null, undefined]) {
      const steps = trackingTimeline(s as string | null | undefined)
      assert.ok(steps.every((step) => !step.current), `no current for ${s}`)
      assert.equal(steps.filter((step) => step.reached).length <= 1, true, `<=1 reached for ${s}`)
    }
  })

  test('LABEL_CREATED reaches only the first step', () => {
    const steps = trackingTimeline('LABEL_CREATED')
    assert.equal(steps[0].reached, true)
    assert.equal(steps[0].current, true)
    assert.equal(steps.slice(1).some((s) => s.reached), false)
  })
})

describe('isExceptionStatus', () => {
  test('EXCEPTION and CANCELLED are exceptions', () => {
    assert.equal(isExceptionStatus('EXCEPTION'), true)
    assert.equal(isExceptionStatus('CANCELLED'), true)
  })
  test('happy-path statuses are not', () => {
    assert.equal(isExceptionStatus('DELIVERED'), false)
    assert.equal(isExceptionStatus('IN_TRANSIT'), false)
    assert.equal(isExceptionStatus(null), false)
  })
})
