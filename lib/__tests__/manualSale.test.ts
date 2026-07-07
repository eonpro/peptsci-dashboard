import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validateManualSale } from '../manual-sale.ts'

describe('validateManualSale', () => {
  test('accepts a full manual sale and normalizes strings', () => {
    const result = validateManualSale({
      customerName: '  Dr. Jane Smith ',
      customerEmail: 'jane@clinic.com',
      customerPhone: '555-123-4567',
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      date: '2026-01-15',
      orderRef: 'P-0115-001',
      product: 'Tirzepatide 60mg',
      vials: 2,
      amountPerVial: 449.5,
      paidAmount: 899,
      notes: 'Manual entry',
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.customerName, 'Dr. Jane Smith')
    assert.equal(result.value.paidAmount, 899)
    assert.equal(result.value.vials, 2)
    assert.equal(result.value.invoicePaid, true)
    assert.ok(result.value.date instanceof Date)
  })

  test('accepts a customer-only record (no sale figures)', () => {
    const result = validateManualSale({ customerName: 'New Clinic' })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.paidAmount, 0)
    assert.equal(result.value.vials, 0)
    assert.equal(result.value.invoicePaid, false)
    assert.equal(result.value.date, null)
  })

  test('requires at least one customer identifier', () => {
    const result = validateManualSale({ product: 'BPC-157' })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.ok(result.errors.some((e) => e.includes('customer name, email, or phone')))
  })

  test('email alone is a sufficient identifier, but must be valid', () => {
    assert.equal(validateManualSale({ customerEmail: 'a@b.co' }).ok, true)
    const bad = validateManualSale({ customerEmail: 'not-an-email' })
    assert.equal(bad.ok, false)
  })

  test('derives paidAmount from vials * amountPerVial when omitted', () => {
    const result = validateManualSale({
      customerName: 'A',
      vials: 3,
      amountPerVial: 100,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.paidAmount, 300)
  })

  test('derives amountPerVial from paidAmount / vials when omitted', () => {
    const result = validateManualSale({
      customerName: 'A',
      vials: 4,
      paidAmount: 200,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.amountPerVial, 50)
  })

  test('respects explicit invoicePaid=false with a positive paid amount', () => {
    const result = validateManualSale({
      customerName: 'A',
      paidAmount: 100,
      invoicePaid: false,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.value.invoicePaid, false)
  })

  test('rejects negative and non-integer numbers', () => {
    const neg = validateManualSale({ customerName: 'A', paidAmount: -5 })
    assert.equal(neg.ok, false)
    const frac = validateManualSale({ customerName: 'A', vials: 1.5 })
    assert.equal(frac.ok, false)
  })

  test('rejects an unparseable date', () => {
    const result = validateManualSale({ customerName: 'A', date: 'not a date' })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.ok(result.errors.some((e) => e.includes('date')))
  })
})
