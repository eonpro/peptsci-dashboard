import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { orderConfirmationEmail } from '../email/templates.ts'

const base = {
  customerName: 'Dr. Smith',
  orderNumber: 1234,
  items: [
    { name: 'BPC-157', dose: '10mg', quantity: 2, lineTotal: '$180.00' },
    { name: 'Tesamorelin', dose: null, quantity: 1, lineTotal: '$95.00' },
  ],
  subtotal: '$275.00',
  shipping: '$25.00',
  total: '$300.00',
  paymentLabel: 'Paid by card',
}

describe('orderConfirmationEmail', () => {
  test('includes order number, items, and totals in both bodies', () => {
    const { subject, html, text } = orderConfirmationEmail(base)
    assert.match(subject, /#1234/)
    assert.match(subject, /confirm/i)
    for (const body of [html, text]) {
      assert.match(body, /BPC-157/)
      assert.match(body, /Tesamorelin/)
      assert.match(body, /\$300\.00/)
      assert.match(body, /\$25\.00/)
      assert.match(body, /Paid by card/)
    }
  })

  test('escapes HTML in user-controlled product names', () => {
    const { html } = orderConfirmationEmail({
      ...base,
      items: [{ name: '<script>x</script>', dose: null, quantity: 1, lineTotal: '$1.00' }],
    })
    assert.doesNotMatch(html, /<script>x<\/script>/)
    assert.match(html, /&lt;script&gt;/)
  })

  test('shows a billed-to-account payment label for terms orders', () => {
    const { html, text } = orderConfirmationEmail({
      ...base,
      paymentLabel: 'Billed to account — Net 30',
    })
    assert.match(text, /Net 30/)
    assert.match(html, /Net 30/)
  })

  test('falls back to a generic greeting without a name', () => {
    const { text } = orderConfirmationEmail({ ...base, customerName: null })
    assert.match(text, /^Hello,/)
  })
})
