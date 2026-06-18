import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseSalesCsv, salesImportTemplate, SALES_IMPORT_HEADERS } from '../sales-import.ts'

describe('parseSalesCsv', () => {
  test('parses valid rows with aliases and currency symbols', () => {
    const csv = [
      'Date,Order ID,Provider Name,Email,Invoice Total,Units #,Price/Unit,Treatment,Cost,COGS',
      '2026-01-15,P-0115-001,Dr. Jane,jane@clinic.com,"$899.00",2,$449.50,Tirzepatide 60mg,$160.00,$320.00',
    ].join('\n')
    const { rows, errors } = parseSalesCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    const r = rows[0]
    assert.equal(r.orderId, 'P-0115-001')
    assert.equal(r.customerName, 'Dr. Jane')
    assert.equal(r.customerEmail, 'jane@clinic.com')
    assert.equal(r.paidAmount, 899)
    assert.equal(r.vials, 2)
    assert.equal(r.amountPerVial, 449.5)
    assert.equal(r.product, 'Tirzepatide 60mg')
    assert.equal(r.unitCost, 160)
    assert.equal(r.cogs, 320)
  })

  test('parses invoicePaid truthy variants', () => {
    const csv = ['paidAmount,invoicePaid,customerName', '100,yes,A', '50,no,B'].join('\n')
    const { rows } = parseSalesCsv(csv)
    assert.equal(rows[0].invoicePaid, true)
    assert.equal(rows[1].invoicePaid, false)
  })

  test('skips blank/meaningless rows rather than erroring', () => {
    const csv = ['paidAmount,customerName,product', '0,,', '500,Dr. Smith,'].join('\n')
    const { rows, errors } = parseSalesCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].customerName, 'Dr. Smith')
  })

  test('flags non-numeric amounts', () => {
    const csv = ['paidAmount,customerName', 'abc,Dr. Smith'].join('\n')
    const { rows, errors } = parseSalesCsv(csv)
    assert.equal(rows.length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /paidAmount must be a number/)
  })

  test('errors when no recognized columns present', () => {
    const { rows, errors } = parseSalesCsv('foo,bar\n1,2')
    assert.equal(rows.length, 0)
    assert.equal(errors[0].rowNumber, 1)
    assert.match(errors[0].message, /No recognized columns/)
  })

  test('template round-trips through the parser', () => {
    const { rows, errors } = parseSalesCsv(salesImportTemplate())
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.ok(SALES_IMPORT_HEADERS.includes('paidAmount'))
  })
})
