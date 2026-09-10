import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatPhoneDisplay,
  messagePreview,
  smsSegmentInfo,
  SMS_MAX_REPLY_LENGTH,
  conversationPatchSchema,
  conversationReplySchema,
  conversationListQuerySchema,
  nextConversationStatusAfterInbound,
  displayNameForStaff,
  consentStateFor,
} from '../sms/inbox-utils.ts'

describe('formatPhoneDisplay', () => {
  test('formats US E.164 as (AAA) BBB-CCCC', () => {
    assert.equal(formatPhoneDisplay('+18132637844'), '(813) 263-7844')
  })
  test('leaves non-US numbers untouched', () => {
    assert.equal(formatPhoneDisplay('+447911123456'), '+447911123456')
  })
  test('tolerates garbage', () => {
    assert.equal(formatPhoneDisplay(''), '')
    assert.equal(formatPhoneDisplay('abc'), 'abc')
  })
})

describe('messagePreview', () => {
  test('collapses whitespace and truncates with an ellipsis', () => {
    const long = 'Hello   there\n\nthis is a long message '.repeat(10)
    const p = messagePreview(long, 40)
    assert.ok(p.length <= 40)
    assert.ok(p.endsWith('…'))
    assert.ok(!p.includes('\n'))
  })
  test('short bodies pass through trimmed', () => {
    assert.equal(messagePreview('  Thanks!  '), 'Thanks!')
  })
})

describe('smsSegmentInfo', () => {
  test('GSM-7 text: 160 per segment', () => {
    assert.deepEqual(smsSegmentInfo('a'.repeat(160)), { chars: 160, segments: 1, unicode: false })
    assert.equal(smsSegmentInfo('a'.repeat(161)).segments, 2)
  })
  test('unicode text: 70 per segment', () => {
    assert.deepEqual(smsSegmentInfo('héllo 🙂'.repeat(10)), { chars: 70, segments: 1, unicode: true })
    assert.equal(smsSegmentInfo('héllo 🙂'.repeat(11)).segments, 2)
  })
  test('empty string is zero segments', () => {
    assert.equal(smsSegmentInfo('').segments, 0)
  })
})

describe('schemas', () => {
  test('reply body is trimmed and bounded', () => {
    assert.equal(conversationReplySchema.parse({ body: '  hi  ' }).body, 'hi')
    assert.throws(() => conversationReplySchema.parse({ body: '' }))
    assert.throws(() => conversationReplySchema.parse({ body: 'x'.repeat(SMS_MAX_REPLY_LENGTH + 1) }))
  })
  test('patch accepts status / assignee / client / contactName and rejects unknown status', () => {
    const ok = conversationPatchSchema.parse({
      status: 'CLOSED',
      assignedToId: null,
      clientId: 'c1',
      contactName: ' Dr. Lee ',
    })
    assert.equal(ok.contactName, 'Dr. Lee')
    assert.throws(() => conversationPatchSchema.parse({ status: 'ARCHIVED' }))
    assert.throws(() => conversationPatchSchema.parse({}))
  })
  test('list query defaults to OPEN and coerces flags', () => {
    const q = conversationListQuerySchema.parse({})
    assert.equal(q.status, 'OPEN')
    assert.equal(q.unread, false)
    const q2 = conversationListQuerySchema.parse({ status: 'ALL', unread: '1', mine: 'true', q: ' 7844 ' })
    assert.equal(q2.status, 'ALL')
    assert.equal(q2.unread, true)
    assert.equal(q2.mine, true)
    assert.equal(q2.q, '7844')
  })
})

describe('nextConversationStatusAfterInbound', () => {
  test('an inbound message reopens a closed thread', () => {
    assert.equal(nextConversationStatusAfterInbound('CLOSED'), 'OPEN')
    assert.equal(nextConversationStatusAfterInbound('OPEN'), 'OPEN')
  })
})

describe('displayNameForStaff', () => {
  test('prefers full name, then email, then fallback', () => {
    assert.equal(displayNameForStaff({ firstName: 'Ana', lastName: 'Ruiz', email: 'a@x.com' }), 'Ana Ruiz')
    assert.equal(displayNameForStaff({ firstName: null, lastName: null, email: 'a@x.com' }), 'a@x.com')
    assert.equal(displayNameForStaff(null), 'PeptSci')
  })
})

describe('consentStateFor', () => {
  test('STOP on file wins', () => {
    assert.equal(consentStateFor({ optedOutAt: new Date(), consentedAt: new Date() }, true), 'OPTED_OUT')
  })
  test('subscriber consent → SUBSCRIBED', () => {
    assert.equal(consentStateFor({ optedOutAt: null, consentedAt: new Date() }, false), 'SUBSCRIBED')
  })
  test('client smsOptIn without a subscriber row → SUBSCRIBED', () => {
    assert.equal(consentStateFor(null, true), 'SUBSCRIBED')
  })
  test('nothing on file → UNKNOWN', () => {
    assert.equal(consentStateFor(null, false), 'UNKNOWN')
  })
})
