import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSupplierPriceCsv,
  supplierImportTemplate,
  classifySupplierHeader,
} from '../supplier-import.ts'

const CREST_HEADER =
  'Cat.No,Name,Specification,Vials Per Box,New Box Price (USD),New Box Price -10% (USD),New Per-Vial (USD),New Per-Vial -10% (USD)'

describe('classifySupplierHeader', () => {
  test('maps Crest-style headers', () => {
    assert.equal(classifySupplierHeader('Cat.No'), 'supplierSku')
    assert.equal(classifySupplierHeader('Name'), 'productName')
    assert.equal(classifySupplierHeader('Specification'), 'dose')
    assert.equal(classifySupplierHeader('Vials Per Box'), 'vialsPerBox')
    assert.equal(classifySupplierHeader('New Box Price (USD)'), 'boxPrice')
    assert.equal(classifySupplierHeader('New Box Price -10% (USD)'), 'boxPriceDiscounted')
    assert.equal(classifySupplierHeader('New Per-Vial (USD)'), 'perVial')
    assert.equal(classifySupplierHeader('New Per-Vial -10% (USD)'), 'perVialDiscounted')
  })

  test('maps generic aliases', () => {
    assert.equal(classifySupplierHeader('SKU'), 'supplierSku')
    assert.equal(classifySupplierHeader('Product'), 'productName')
    assert.equal(classifySupplierHeader('Dose'), 'dose')
    assert.equal(classifySupplierHeader('Unit Cost'), 'unitCost')
    assert.equal(classifySupplierHeader('nonsense column'), undefined)
  })
})

describe('parseSupplierPriceCsv', () => {
  test('parses a Crest-style row using the discounted per-vial price as cost', () => {
    const csv = [CREST_HEADER, 'SM5,Semaglutide,5mg,10,40.00,36.00,4.00,3.60'].join('\n')
    const { rows, errors } = parseSupplierPriceCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0], {
      rowNumber: 2,
      supplierSku: 'SM5',
      productName: 'Semaglutide',
      dose: '5mg',
      vialsPerBox: 10,
      unitCost: 3.6,
      listPrice: 4,
    })
  })

  test('falls back to list per-vial when no discounted column exists', () => {
    const csv = ['Cat.No,Name,Specification,Per-Vial (USD)', 'BC5,BPC-157,5mg,3.50'].join('\n')
    const { rows, errors } = parseSupplierPriceCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows[0].unitCost, 3.5)
    assert.equal(rows[0].listPrice, undefined)
  })

  test('derives per-vial cost from box price / vials per box', () => {
    const csv = [
      'Cat.No,Name,Specification,Vials Per Box,Box Price (USD),Box Price -10% (USD)',
      'CBL60,Cerebrolysin,60mg,6,70.00,63.00',
    ].join('\n')
    const { rows, errors } = parseSupplierPriceCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows[0].unitCost, 10.5) // 63 / 6
    assert.equal(rows[0].listPrice, 11.67) // 70 / 6 rounded
  })

  test('reports missing required columns', () => {
    const { rows, errors } = parseSupplierPriceCsv('Name,Per-Vial\nBPC,3.50\n')
    assert.equal(rows.length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /Cat\.No \/ SKU/)
  })

  test('reports missing price column', () => {
    const { rows, errors } = parseSupplierPriceCsv('Cat.No,Name\nBC5,BPC-157\n')
    assert.equal(rows.length, 0)
    assert.match(errors[0].message, /price column/)
  })

  test('flags per-row errors and continues', () => {
    const csv = [
      CREST_HEADER,
      ',NoSku,5mg,10,40,36,4,3.6',
      'DUP,Thing,5mg,10,40,36,4,3.6',
      'DUP,Thing,10mg,10,50,45,5,4.5',
      'OK1,Good,5mg,10,40,36,4,3.6',
    ].join('\n')
    const { rows, errors } = parseSupplierPriceCsv(csv)
    assert.equal(rows.length, 2) // first DUP row + OK1
    assert.equal(errors.length, 2)
    assert.match(errors[0].message, /Cat\.No \/ SKU is required/)
    assert.match(errors[1].message, /duplicate Cat\.No/)
  })

  test('handles currency symbols and non-mg specifications', () => {
    const csv = [
      CREST_HEADER,
      'B12,B12,"1mg/mL 10mL vial",10,"$40.00","$36.00","$4.00","$3.60"',
    ].join('\n')
    const { rows, errors } = parseSupplierPriceCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows[0].dose, '1mg/mL 10mL vial')
    assert.equal(rows[0].unitCost, 3.6)
  })

  test('template round-trips through the parser', () => {
    const { rows, errors } = parseSupplierPriceCsv(supplierImportTemplate())
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].supplierSku, 'TSM10')
    assert.equal(rows[0].unitCost, 15.75)
  })
})
