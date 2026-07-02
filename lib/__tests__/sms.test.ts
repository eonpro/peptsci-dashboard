import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { toE164US, isValidPhone } from '../sms/phone.ts'
import {
  orderShippedSms,
  orderDeliveredSms,
  orderExceptionSms,
  invoiceOverdueSms,
} from '../sms/templates.ts'

describe('toE164US', () => {
  test('formats a 10-digit US number', () => {
    assert.equal(toE164US('(555) 123-4567'), '+15551234567')
    assert.equal(toE164US('555.123.4567'), '+15551234567')
    assert.equal(toE164US('5551234567'), '+15551234567')
  })
  test('formats an 11-digit number starting with 1', () => {
    assert.equal(toE164US('1-555-123-4567'), '+15551234567')
    assert.equal(toE164US('15551234567'), '+15551234567')
  })
  test('keeps an existing E.164 number (stripping spacing)', () => {
    assert.equal(toE164US('+15551234567'), '+15551234567')
    assert.equal(toE164US('+44 20 7946 0958'), '+442079460958')
  })
  test('rejects junk / wrong length', () => {
    assert.equal(toE164US(''), null)
    assert.equal(toE164US(null), null)
    assert.equal(toE164US('12345'), null)
    assert.equal(toE164US('abc'), null)
  })
  test('isValidPhone reflects normalization', () => {
    assert.equal(isValidPhone('5551234567'), true)
    assert.equal(isValidPhone('nope'), false)
  })
})

describe('SMS templates', () => {
  const opts = { orderNumber: 1042, trackingNumber: '794612345678', carrier: 'FedEx' }
  test('shipped includes order, carrier, tracking link', () => {
    const msg = orderShippedSms(opts)
    assert.match(msg, /#1042/)
    assert.match(msg, /FedEx/)
    assert.match(msg, /\/tracking\/794612345678/)
  })
  test('delivered + exception mention the order', () => {
    assert.match(orderDeliveredSms(opts), /#1042/)
    assert.match(orderExceptionSms(opts), /exception/i)
  })
  test('default carrier is FedEx when omitted', () => {
    assert.match(orderShippedSms({ orderNumber: 5, trackingNumber: 'X' }), /FedEx/)
  })
  test('invoice overdue includes number, amount, due date', () => {
    const msg = invoiceOverdueSms({ invoiceNumber: 'INV-00007', amountDue: '$1,200.00', dueDate: '2026-06-01' })
    assert.match(msg, /INV-00007/)
    assert.match(msg, /\$1,200\.00/)
    assert.match(msg, /2026-06-01/)
  })
})
