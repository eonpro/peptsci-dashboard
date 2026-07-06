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
