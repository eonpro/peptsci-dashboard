import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDistributorOrderCsv,
  groupDistributorOrders,
  distributorOrderImportTemplate,
} from '../distributor-order-import.ts'

describe('parseDistributorOrderCsv', () => {
  test('parses line rows and computes lineTotal when omitted', () => {
    const csv = [
      'orderId,product,quantity,unitCost',
      'DO-1,Tirzepatide,10,160',
    ].join('\n')
    const { rows, errors } = parseDistributorOrderCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].lineTotal, 1600)
  })

  test('requires orderId and product', () => {
    const { rows, errors } = parseDistributorOrderCsv('foo,bar\n1,2')
    assert.equal(rows.length, 0)
    assert.match(errors[0].message, /Missing required column/)
  })

  test('flags missing quantity', () => {
    const csv = ['orderId,product,quantity', 'DO-1,Tirzepatide,'].join('\n')
    const { rows, errors } = parseDistributorOrderCsv(csv)
    assert.equal(rows.length, 0)
    assert.match(errors[0].message, /quantity is required/)
  })
})

describe('parseDistributorOrderCsv (ledger format)', () => {
  test('parses spreadsheet ledger with shipping, fee, and subtotal rows', () => {
    const csv = [
      ',Date of Order,Total Order Amount,Products,Product dose,Amount,Cost per item,Totals',
      ',8/16/25,669.9,Semaglutide,10mg,$10.00,$7.00,$70.00',
      ',,,Tesamorelin,10mg,$10.00,$9.00,$90.00',
      ',,,Selank,10mg,$10.00,$19.50,$195.00',
      ',,,,,,,$355.00',
      ',,,Shipping,,,,$80.00',
      ',,,Paypal Fee,,,$0.05,$31.90',
      ',,,,,,,$466.90',
      ',,,,,,,',
      ',8/31/25,"$8,394.75",,,,,',
      ',,,Tirzepatide,60mg,$100.00,$23.00,"$2,300.00"',
      ',,,Semaglutide,5mg,$200.00,$4.50,$900.00',
      ',,,Shipping,,,,$380.00',
      ',,,Paypal Fee,,,$0.05,$399.75',
    ].join('\n')
    const { rows, errors } = parseDistributorOrderCsv(csv)
    assert.equal(errors.length, 0)
    const orders = groupDistributorOrders(rows)
    assert.equal(orders.length, 2)

    const [o1, o2] = orders
    assert.equal(o1.externalId, 'PO-2025-08-16')
    assert.equal(o1.orderDate, '8/16/25')
    assert.equal(o1.lines.length, 3)
    assert.equal(o1.shipping, 80)
    assert.equal(o1.paypalFee, 31.9)
    assert.equal(o1.subtotal, 355)
    // Explicit "Total Order Amount" wins over computed total.
    assert.equal(o1.total, 669.9)
    assert.equal(o1.lines[0].quantity, 10)
    assert.equal(o1.lines[0].unitCost, 7)
    assert.equal(o1.lines[0].lineTotal, 70)

    assert.equal(o2.externalId, 'PO-2025-08-31')
    assert.equal(o2.total, 8394.75)
    assert.equal(o2.lines.length, 2)
    assert.equal(o2.shipping, 380)
    assert.equal(o2.paypalFee, 399.75)
  })

  test('skips repeated sub-header labels in the product column', () => {
    const csv = [
      'Date of Order,Total Order Amount,Products,Product dose,Amount,Cost per item,Totals',
      '9/18/25,"$10,408.00",Medication,Dose,Quanity,Price,Total',
      ',,NAD+,100mg,$50.00,$40.00,"$2,000.00"',
      ',,Shipping,,,,$160.00',
      ',,Paypal Fee,,,$0.05,$108.00',
    ].join('\n')
    const { rows, errors } = parseDistributorOrderCsv(csv)
    assert.equal(errors.length, 0)
    const orders = groupDistributorOrders(rows)
    assert.equal(orders.length, 1)
    assert.equal(orders[0].lines.length, 1)
    assert.equal(orders[0].lines[0].productName, 'NAD+')
    assert.equal(orders[0].shipping, 160)
    assert.equal(orders[0].paypalFee, 108)
    assert.equal(orders[0].total, 10408)
  })

  test('two orders on the same date get distinct externalIds', () => {
    const csv = [
      'Date of Order,Total Order Amount,Products,Product dose,Amount,Cost per item,Totals',
      '10/1/25,,TB500,5mg,$200.00,$6.30,"$1,260.00"',
      '10/1/25,,LL-37,5mg,$20.00,$6.70,$134.00',
    ].join('\n')
    const { rows } = parseDistributorOrderCsv(csv)
    const orders = groupDistributorOrders(rows)
    assert.equal(orders.length, 2)
    assert.equal(orders[0].externalId, 'PO-2025-10-01')
    assert.equal(orders[1].externalId, 'PO-2025-10-01-2')
  })

  test('flat format is unaffected by ledger detection', () => {
    const csv = ['orderId,product,quantity,unitCost', 'DO-1,Tirzepatide,10,160'].join('\n')
    const { rows, errors } = parseDistributorOrderCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows[0].orderId, 'DO-1')
  })
})

describe('groupDistributorOrders', () => {
  test('groups multiple line rows into one order with subtotal + total', () => {
    const csv = [
      'orderId,orderDate,vendor,shipping,paypalFee,product,quantity,unitCost,lineTotal',
      'DO-1,2026-01-15,Acme,25,12.50,Tirzepatide,10,160,1600',
      'DO-1,,,,,Semaglutide,5,90,450',
    ].join('\n')
    const { rows, errors } = parseDistributorOrderCsv(csv)
    assert.equal(errors.length, 0)
    const orders = groupDistributorOrders(rows)
    assert.equal(orders.length, 1)
    const o = orders[0]
    assert.equal(o.externalId, 'DO-1')
    assert.equal(o.vendor, 'Acme')
    assert.equal(o.lines.length, 2)
    assert.equal(o.subtotal, 2050)
    assert.equal(o.shipping, 25)
    assert.equal(o.paypalFee, 12.5)
    assert.equal(o.total, 2050 + 25 + 12.5)
  })

  test('blank later rows never clobber order-level values from earlier rows', () => {
    const csv = [
      'orderId,orderDate,vendor,status,shipping,paypalFee,product,quantity,unitCost,lineTotal',
      'DO-3,2026-02-01,Acme,shipped,25,12.50,Tirzepatide,10,160,1600',
      'DO-3,,,,,,Semaglutide,5,90,450',
      'DO-3,,,,,,Retatrutide,2,120,240',
    ].join('\n')
    const { rows, errors } = parseDistributorOrderCsv(csv)
    assert.equal(errors.length, 0)
    const orders = groupDistributorOrders(rows)
    assert.equal(orders.length, 1)
    const o = orders[0]
    assert.equal(o.orderDate, '2026-02-01')
    assert.equal(o.vendor, 'Acme')
    assert.equal(o.status, 'shipped')
    assert.equal(o.shipping, 25)
    assert.equal(o.paypalFee, 12.5)
    assert.equal(o.lines.length, 3)
  })

  test('order-level fields fill from a later row when the first row is blank', () => {
    const csv = [
      'orderId,vendor,shipping,product,quantity,unitCost',
      'DO-4,,,Tirzepatide,10,160',
      'DO-4,Acme,25,Semaglutide,5,90',
    ].join('\n')
    const { rows } = parseDistributorOrderCsv(csv)
    const orders = groupDistributorOrders(rows)
    assert.equal(orders[0].vendor, 'Acme')
    assert.equal(orders[0].shipping, 25)
  })

  test('explicit order total overrides computed total', () => {
    const csv = [
      'orderId,total,product,quantity,unitCost',
      'DO-2,999,Tirzepatide,1,160',
    ].join('\n')
    const { rows } = parseDistributorOrderCsv(csv)
    const orders = groupDistributorOrders(rows)
    assert.equal(orders[0].total, 999)
  })

  test('template round-trips into a single grouped order', () => {
    const { rows, errors } = parseDistributorOrderCsv(distributorOrderImportTemplate())
    assert.equal(errors.length, 0)
    const orders = groupDistributorOrders(rows)
    assert.equal(orders.length, 1)
    assert.equal(orders[0].lines.length, 2)
  })
})
