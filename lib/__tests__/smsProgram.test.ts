import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  SMS_PROGRAM_NAME,
  SMS_SUPPORT_EMAIL,
  SMS_CONSENT_CHECKBOX_TEXT,
  SMS_OPT_IN_CONFIRMATION,
  SMS_HELP_MESSAGE,
  SMS_OPT_OUT_CONFIRMATION,
  SMS_OPT_OUT_KEYWORDS,
  smsSubscribeSchema,
  parseSmsSubscribeInput,
} from '../sms/program.ts'
import {
  TERMS_OF_SERVICE_MARKDOWN,
  TERMS_OF_SERVICE_LAST_UPDATED,
} from '../legal/terms-of-service.ts'
import { headingAnchorId, stripHeadingAnchor } from '../legal/anchors.ts'

// Twilio A2P 10DLC / TCPA web-form requirements the campaign registration
// (MessageFlow) claims exist on peptsci.com. Locking the copy here keeps the
// site and the registered campaign from drifting apart (error 30909).
describe('SMS program constants (Twilio campaign parity)', () => {
  test('program identity', () => {
    assert.equal(SMS_PROGRAM_NAME, 'PeptSci Alerts')
    assert.equal(SMS_SUPPORT_EMAIL, 'support@peptsci.com')
  })

  test('checkbox copy matches the registered campaign MessageFlow verbatim', () => {
    assert.equal(
      SMS_CONSENT_CHECKBOX_TEXT,
      'Text me order, shipping and account updates from PeptSci. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Consent is not a condition of purchase. See our Privacy Policy and Terms.'
    )
  })

  test('auto-replies carry program name, rates, frequency, and keywords', () => {
    for (const msg of [SMS_OPT_IN_CONFIRMATION, SMS_HELP_MESSAGE]) {
      assert.match(msg, /PeptSci Alerts/)
      assert.match(msg, /Msg & data rates may apply/)
      assert.match(msg, /Msg frequency varies/)
      assert.match(msg, /STOP/)
    }
    assert.match(SMS_HELP_MESSAGE, /support@peptsci\.com/)
    assert.match(SMS_OPT_OUT_CONFIRMATION, /unsubscribed from PeptSci Alerts/)
    assert.ok(SMS_OPT_OUT_KEYWORDS.includes('STOP'))
    // Carrier limit for a single segment.
    for (const msg of [SMS_OPT_IN_CONFIRMATION, SMS_HELP_MESSAGE, SMS_OPT_OUT_CONFIRMATION]) {
      assert.ok(msg.length <= 160, `${msg.length} chars: ${msg}`)
    }
  })
})

describe('smsSubscribeSchema / parseSmsSubscribeInput', () => {
  test('normalizes a US number to E.164 and requires explicit consent', () => {
    const r = parseSmsSubscribeInput({ phone: '(813) 555-0142', consent: true })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.data.phone, '+18135550142')
      assert.equal(r.data.email, null)
    }
  })

  test('rejects unchecked consent (never implied, never pre-checked)', () => {
    const r = parseSmsSubscribeInput({ phone: '8135550142', consent: false })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /consent/i)
    assert.equal(smsSubscribeSchema.safeParse({ phone: '8135550142' }).success, false)
  })

  test('rejects numbers that cannot be dialed', () => {
    const r = parseSmsSubscribeInput({ phone: '555-01', consent: true })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /phone/i)
  })

  test('lowercases + trims optional email, blank becomes null', () => {
    const a = parseSmsSubscribeInput({ phone: '8135550142', consent: true, email: ' Dr@Clinic.COM ' })
    assert.equal(a.ok && a.data.email, 'dr@clinic.com')
    const b = parseSmsSubscribeInput({ phone: '8135550142', consent: true, email: '' })
    assert.equal(b.ok && b.data.email, null)
  })
})

describe('Terms of Service — SMS section (Twilio error 30882)', () => {
  const sms = TERMS_OF_SERVICE_MARKDOWN.slice(
    TERMS_OF_SERVICE_MARKDOWN.indexOf('## 14. SMS')
  )

  test('has a dedicated SMS section before Contact', () => {
    assert.ok(TERMS_OF_SERVICE_MARKDOWN.includes('## 14. SMS'), 'section 14 missing')
    assert.ok(sms.indexOf('## 15. CONTACT US') > 0, 'contact section must follow SMS terms')
  })

  test('covers every required disclosure', () => {
    assert.match(sms, /PeptSci Alerts/)
    assert.match(sms, /[Mm]essage frequency varies/)
    assert.match(sms, /[Mm]essage and data rates may apply/)
    assert.match(sms, /\*\*STOP\*\*/)
    assert.match(sms, /\*\*HELP\*\*/)
    assert.match(sms, /support@peptsci\.com/)
    assert.match(sms, /not a condition of (any )?purchase/i)
    assert.match(sms, /not (be )?shared with third parties/i)
    assert.match(sms, /carriers are not liable/i)
  })

  test('last-updated date bumped with the SMS terms', () => {
    assert.equal(TERMS_OF_SERVICE_LAST_UPDATED, 'September 7, 2026')
  })
})

describe('legal heading anchors', () => {
  test('turns numbered legal headings into stable slugs', () => {
    assert.equal(headingAnchorId('1. ACCEPTANCE OF TERMS'), 'acceptance-of-terms')
    assert.equal(headingAnchorId('7.2 Marketing and SMS Preferences'), 'marketing-and-sms-preferences')
    assert.equal(headingAnchorId(''), undefined)
  })

  test('honors an explicit {#id} override and strips it from display text', () => {
    const raw = '14. SMS / TEXT MESSAGE TERMS (PEPTSCI ALERTS) {#sms}'
    assert.equal(headingAnchorId(raw), 'sms')
    assert.equal(stripHeadingAnchor(raw), '14. SMS / TEXT MESSAGE TERMS (PEPTSCI ALERTS)')
    assert.equal(stripHeadingAnchor('1. ACCEPTANCE OF TERMS'), '1. ACCEPTANCE OF TERMS')
  })

  test('terms SMS section is reachable at /termsandconditions#sms', () => {
    assert.match(TERMS_OF_SERVICE_MARKDOWN, /^## 14\. SMS.*\{#sms\}$/m)
  })
})
