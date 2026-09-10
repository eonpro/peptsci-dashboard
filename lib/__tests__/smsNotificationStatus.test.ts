import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { describeShippedText } from '../sms/notification-status'

const base = {
  trackingNumber: '794644790132',
  smsOptIn: true,
  contactPhone: '+18132637844',
  smsConfigured: true,
  last: null,
}

describe('describeShippedText', () => {
  test('no tracking yet → null (nothing to report)', () => {
    assert.equal(describeShippedText({ ...base, trackingNumber: null }), null)
  })

  test('delivered / sent / queued map to positive states', () => {
    assert.equal(describeShippedText({ ...base, last: { status: 'DELIVERED', errorCode: null, errorMessage: null, createdAt: '2026-09-09T00:00:00Z' } })?.state, 'DELIVERED')
    assert.equal(describeShippedText({ ...base, last: { status: 'SENT', errorCode: null, errorMessage: null, createdAt: '2026-09-09T00:00:00Z' } })?.state, 'SENT')
    assert.equal(describeShippedText({ ...base, last: { status: 'QUEUED', errorCode: null, errorMessage: null, createdAt: '2026-09-09T00:00:00Z' } })?.state, 'SENT')
  })

  test('failed with 21610 explains the STOP', () => {
    const r = describeShippedText({
      ...base,
      last: { status: 'FAILED', errorCode: '21610', errorMessage: null, createdAt: '2026-09-09T00:00:00Z' },
    })
    assert.equal(r?.state, 'FAILED')
    assert.match(r?.detail ?? '', /opted out|STOP/i)
  })

  test('undelivered with carrier message surfaces it', () => {
    const r = describeShippedText({
      ...base,
      last: { status: 'UNDELIVERED', errorCode: '30003', errorMessage: 'Unreachable destination handset', createdAt: '2026-09-09T00:00:00Z' },
    })
    assert.equal(r?.state, 'FAILED')
    assert.match(r?.detail ?? '', /Unreachable/)
  })

  test('skipped row keeps the app reason', () => {
    const r = describeShippedText({
      ...base,
      last: { status: 'SKIPPED', errorCode: null, errorMessage: 'Recipient has opted out (STOP)', createdAt: '2026-09-09T00:00:00Z' },
    })
    assert.equal(r?.state, 'SKIPPED')
    assert.match(r?.detail ?? '', /opted out/)
  })

  test('never attempted: explains why in priority order', () => {
    assert.match(describeShippedText({ ...base, contactPhone: null })?.detail ?? '', /no phone/i)
    assert.match(describeShippedText({ ...base, contactPhone: '   ' })?.detail ?? '', /no phone/i)
    assert.match(describeShippedText({ ...base, smsOptIn: false })?.detail ?? '', /opted in/i)
    assert.match(describeShippedText({ ...base, smsConfigured: false })?.detail ?? '', /disabled/i)
    const r = describeShippedText(base)
    assert.equal(r?.state, 'NOT_SENT')
    assert.match(r?.detail ?? '', /no text was sent/i)
  })

  test('each result carries a short label and a tone', () => {
    const r = describeShippedText({ ...base, smsOptIn: false })
    assert.ok(r && r.label.length > 0 && ['ok', 'warn', 'muted'].includes(r.tone))
  })
})
