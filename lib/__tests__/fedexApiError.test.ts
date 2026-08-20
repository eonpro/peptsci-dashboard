import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  FedExApiError,
  extractFedExErrorCode,
  shouldAbortTrackingPoll,
} from '../shipping/fedex-api-error.ts'

const FORBIDDEN_BODY = JSON.stringify({
  transactionId: 'fd065242-973e-41fc-89a3-294c54d60b3b',
  errors: [
    {
      code: 'FORBIDDEN.ERROR',
      message: 'We could not authorize your credentials. Please check your permissions and try again.',
    },
  ],
})

describe('extractFedExErrorCode', () => {
  test('reads errors[0].code from JSON', () => {
    assert.equal(extractFedExErrorCode(FORBIDDEN_BODY), 'FORBIDDEN.ERROR')
  })

  test('falls back to a regex when JSON is wrapped in noise', () => {
    assert.equal(
      extractFedExErrorCode(`FedEx API error: 403 - ${FORBIDDEN_BODY}`),
      'FORBIDDEN.ERROR'
    )
  })

  test('returns null for empty / unrelated bodies', () => {
    assert.equal(extractFedExErrorCode(''), null)
    assert.equal(extractFedExErrorCode('not json'), null)
  })
})

describe('FedExApiError', () => {
  test('403 FORBIDDEN.ERROR aborts the tracking poll', () => {
    const err = new FedExApiError({
      status: 403,
      path: '/track/v1/trackingnumbers',
      body: FORBIDDEN_BODY,
    })
    assert.equal(err.code, 'FORBIDDEN.ERROR')
    assert.equal(err.isForbidden, true)
    assert.equal(shouldAbortTrackingPoll(err), true)
    assert.match(err.message, /403/)
  })

  test('does not abort on a per-number track miss', () => {
    const err = new FedExApiError({
      status: 400,
      path: '/track/v1/trackingnumbers',
      body: JSON.stringify({
        errors: [{ code: 'TRACKING.TRACKINGNUMBER.NOTFOUND', message: 'not found' }],
      }),
    })
    assert.equal(err.isForbidden, false)
    assert.equal(shouldAbortTrackingPoll(err), false)
  })

  test('does not abort on 5xx', () => {
    const err = new FedExApiError({
      status: 503,
      path: '/track/v1/trackingnumbers',
      body: '{"errors":[{"code":"SERVICE.UNAVAILABLE"}]}',
    })
    assert.equal(shouldAbortTrackingPoll(err), false)
  })

  test('generic Error does not abort', () => {
    assert.equal(shouldAbortTrackingPoll(new Error('timeout')), false)
    assert.equal(shouldAbortTrackingPoll('boom'), false)
  })
})
