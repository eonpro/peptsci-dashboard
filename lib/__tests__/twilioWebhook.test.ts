import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  computeTwilioSignature,
  validateTwilioSignature,
  classifyInboundKeyword,
  mapTwilioMessageStatus,
  shouldApplyStatusTransition,
  twilioWebhookCandidateUrls,
  formDataToParams,
  TWILIO_ERROR_RECIPIENT_OPTED_OUT,
} from '../sms/twilio-webhook.ts'

const TOKEN = '12345'
const URL_ = 'https://peptsci.com/api/webhooks/twilio/inbound'

describe('computeTwilioSignature', () => {
  test('matches the documented algorithm (HMAC-SHA1 over url + sorted key/value pairs)', () => {
    const params = { To: '+15551234567', From: '+15559876543', Body: 'STOP' }
    // Reference: Twilio docs — sort params by key, append key then value.
    const expected = createHmac('sha1', TOKEN)
      .update(`${URL_}Body${'STOP'}From${'+15559876543'}To${'+15551234567'}`)
      .digest('base64')
    assert.equal(computeTwilioSignature(TOKEN, URL_, params), expected)
  })

  test('signature over a URL with no params is just the URL', () => {
    const expected = createHmac('sha1', TOKEN).update(URL_).digest('base64')
    assert.equal(computeTwilioSignature(TOKEN, URL_, {}), expected)
  })
})

describe('validateTwilioSignature', () => {
  const params = { MessageSid: 'SM123', MessageStatus: 'delivered' }
  const good = computeTwilioSignature(TOKEN, URL_, params)

  test('accepts a valid signature for one of the candidate URLs', () => {
    assert.equal(
      validateTwilioSignature({
        authToken: TOKEN,
        urls: ['http://internal.local/api/webhooks/twilio/inbound', URL_],
        params,
        signature: good,
      }),
      true
    )
  })
  test('rejects a tampered body', () => {
    assert.equal(
      validateTwilioSignature({
        authToken: TOKEN,
        urls: [URL_],
        params: { ...params, MessageStatus: 'failed' },
        signature: good,
      }),
      false
    )
  })
  test('rejects a missing / malformed header or missing token', () => {
    assert.equal(validateTwilioSignature({ authToken: TOKEN, urls: [URL_], params, signature: null }), false)
    assert.equal(validateTwilioSignature({ authToken: TOKEN, urls: [URL_], params, signature: 'nope' }), false)
    assert.equal(validateTwilioSignature({ authToken: '', urls: [URL_], params, signature: good }), false)
  })
})

describe('twilioWebhookCandidateUrls', () => {
  test('includes the request URL and the public-origin rewrite, de-duplicated', () => {
    const urls = twilioWebhookCandidateUrls(
      'http://10.0.0.1:3000/api/webhooks/twilio/status?x=1',
      'https://peptsci.com/'
    )
    assert.deepEqual(urls, [
      'http://10.0.0.1:3000/api/webhooks/twilio/status?x=1',
      'https://peptsci.com/api/webhooks/twilio/status?x=1',
    ])
    assert.deepEqual(twilioWebhookCandidateUrls(URL_, 'https://peptsci.com'), [URL_])
    assert.deepEqual(twilioWebhookCandidateUrls(URL_, ''), [URL_])
  })
})

describe('formDataToParams', () => {
  test('keeps string fields, drops files', () => {
    const fd = new FormData()
    fd.set('Body', 'STOP')
    fd.set('From', '+15551234567')
    fd.set('Media', new Blob(['x']))
    assert.deepEqual(formDataToParams(fd), { Body: 'STOP', From: '+15551234567' })
  })
})

describe('classifyInboundKeyword', () => {
  test('recognises campaign STOP / START / HELP keywords case- and whitespace-insensitively', () => {
    assert.equal(classifyInboundKeyword(' stop '), 'STOP')
    assert.equal(classifyInboundKeyword('UNSUBSCRIBE'), 'STOP')
    assert.equal(classifyInboundKeyword('Quit'), 'STOP')
    assert.equal(classifyInboundKeyword('start'), 'START')
    assert.equal(classifyInboundKeyword('yes'), 'START')
    assert.equal(classifyInboundKeyword('UNSTOP'), 'START')
    assert.equal(classifyInboundKeyword('help'), 'HELP')
    assert.equal(classifyInboundKeyword('info.'), 'HELP')
  })
  test('anything else is null (free-form replies are not keywords)', () => {
    assert.equal(classifyInboundKeyword('please stop texting me'), null)
    assert.equal(classifyInboundKeyword(''), null)
    assert.equal(classifyInboundKeyword(undefined), null)
  })
})

describe('mapTwilioMessageStatus', () => {
  test('maps every Twilio status to a log status', () => {
    assert.equal(mapTwilioMessageStatus('queued'), 'QUEUED')
    assert.equal(mapTwilioMessageStatus('accepted'), 'QUEUED')
    assert.equal(mapTwilioMessageStatus('sending'), 'QUEUED')
    assert.equal(mapTwilioMessageStatus('sent'), 'SENT')
    assert.equal(mapTwilioMessageStatus('delivered'), 'DELIVERED')
    assert.equal(mapTwilioMessageStatus('read'), 'DELIVERED')
    assert.equal(mapTwilioMessageStatus('undelivered'), 'UNDELIVERED')
    assert.equal(mapTwilioMessageStatus('failed'), 'FAILED')
    assert.equal(mapTwilioMessageStatus('canceled'), 'FAILED')
    assert.equal(mapTwilioMessageStatus('Delivered'), 'DELIVERED')
    assert.equal(mapTwilioMessageStatus('weird'), null)
  })
})

describe('shouldApplyStatusTransition', () => {
  test('never regresses a terminal or later status (out-of-order callbacks)', () => {
    assert.equal(shouldApplyStatusTransition('QUEUED', 'SENT'), true)
    assert.equal(shouldApplyStatusTransition('SENT', 'DELIVERED'), true)
    assert.equal(shouldApplyStatusTransition('DELIVERED', 'SENT'), false)
    assert.equal(shouldApplyStatusTransition('FAILED', 'QUEUED'), false)
    assert.equal(shouldApplyStatusTransition('SENT', 'SENT'), false)
    assert.equal(shouldApplyStatusTransition('SKIPPED', 'DELIVERED'), false)
    assert.equal(shouldApplyStatusTransition('QUEUED', 'FAILED'), true)
  })
})

test('Twilio opted-out error code constant', () => {
  assert.equal(TWILIO_ERROR_RECIPIENT_OPTED_OUT, '21610')
})
