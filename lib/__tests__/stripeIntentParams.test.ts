import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  savedCardPaymentIntentParams,
  newCardPaymentIntentParams,
} from '../stripe/intent-params.ts'

describe('savedCardPaymentIntentParams', () => {
  test('confirms off-session without setup_future_usage', () => {
    const params = savedCardPaymentIntentParams()
    assert.equal(params.confirm, true)
    assert.equal(params.off_session, true)
    assert.equal(params.setup_future_usage, undefined)
  })

  test('never combines off_session with setup_future_usage', () => {
    const params = savedCardPaymentIntentParams()
    assert.ok(!(params.off_session && params.setup_future_usage))
  })
})

describe('newCardPaymentIntentParams', () => {
  test('sets setup_future_usage only when saving the card', () => {
    assert.deepEqual(newCardPaymentIntentParams({ saveCard: true }), {
      setup_future_usage: 'off_session',
    })
    assert.deepEqual(newCardPaymentIntentParams({ saveCard: false }), {})
    assert.deepEqual(newCardPaymentIntentParams({}), {})
  })

  test('does not confirm off-session (Elements confirms on-session)', () => {
    const saving = newCardPaymentIntentParams({ saveCard: true })
    const notSaving = newCardPaymentIntentParams({ saveCard: false })
    assert.equal(saving.off_session, undefined)
    assert.equal(saving.confirm, undefined)
    assert.equal(notSaving.off_session, undefined)
  })
})
