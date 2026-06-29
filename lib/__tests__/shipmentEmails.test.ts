import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  orderShippedEmail,
  orderDeliveredEmail,
  orderExceptionEmail,
} from '../email/templates.ts'

const base = {
  customerName: 'Dr. Smith',
  orderNumber: 1234,
  trackingNumber: '794613245678',
  carrier: 'FedEx',
}

describe('orderShippedEmail', () => {
  test('includes order number, tracking number, and a tracking link', () => {
    const { subject, html, text } = orderShippedEmail(base)
    assert.match(subject, /#1234/)
    assert.match(subject, /shipped/i)
    for (const body of [html, text]) {
      assert.match(body, /794613245678/)
      assert.match(body, /#1234/)
      assert.match(body, /FedEx/)
      assert.match(body, /\/tracking\/794613245678/)
    }
  })

  test('renders an ETA when provided', () => {
    const { html, text } = orderShippedEmail({ ...base, eta: 'Tue, Jul 1' })
    assert.match(html, /Tue, Jul 1/)
    assert.match(text, /Tue, Jul 1/)
  })

  test('falls back to a generic greeting without a name', () => {
    const { text } = orderShippedEmail({ ...base, customerName: null })
    assert.match(text, /^Hello,/)
  })
})

describe('orderDeliveredEmail', () => {
  test('mentions delivered + carries tracking detail', () => {
    const { subject, html } = orderDeliveredEmail(base)
    assert.match(subject, /delivered/i)
    assert.match(html, /794613245678/)
    assert.match(html, /#1234/)
  })
})

describe('orderExceptionEmail', () => {
  test('communicates a delay and links to status', () => {
    const { subject, html, text } = orderExceptionEmail(base)
    assert.match(subject, /#1234/)
    assert.match(html, /delay/i)
    assert.match(text, /\/tracking\/794613245678/)
  })

  test('defaults carrier to FedEx when omitted', () => {
    const { text } = orderExceptionEmail({ ...base, carrier: null })
    assert.match(text, /FedEx/)
  })
})
