import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, parseProductCsv, productImportTemplate } from '../product-import.ts'

describe('parseCsv', () => {
  test('parses simple rows and strips BOM', () => {
    const out = parseCsv('\uFEFFa,b,c\n1,2,3\n')
    assert.deepEqual(out, [
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  test('handles quoted fields with commas and escaped quotes', () => {
    const out = parseCsv('name,note\n"Smith, John","He said ""hi"""\n')
    assert.deepEqual(out, [
      ['name', 'note'],
      ['Smith, John', 'He said "hi"'],
    ])
  })

  test('handles quoted newlines and CRLF', () => {
    const out = parseCsv('a,b\r\n"line1\nline2",x\r\n')
    assert.deepEqual(out, [
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ])
  })

  test('drops fully empty trailing rows', () => {
    const out = parseCsv('a\n1\n\n')
    assert.deepEqual(out, [['a'], ['1']])
  })
})

describe('parseProductCsv', () => {
  test('parses valid rows with aliases and currency symbols', () => {
    const csv = [
      'Product,SKU,Dose,Our Cost,Retail Price,Manufacturer,Catalog #',
      'Tesamorelin,TES-10,10mg,$45.00,"$129.00",Acme,ACME-1',
    ].join('\n')
    const { rows, errors } = parseProductCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.deepEqual(
      {
        name: rows[0].name,
        sku: rows[0].sku,
        dose: rows[0].dose,
        unitCost: rows[0].unitCost,
        srp: rows[0].srp,
        supplierName: rows[0].supplierName,
        supplierSku: rows[0].supplierSku,
      },
      {
        name: 'Tesamorelin',
        sku: 'TES-10',
        dose: '10mg',
        unitCost: 45,
        srp: 129,
        supplierName: 'Acme',
        supplierSku: 'ACME-1',
      }
    )
  })

  test('reports missing required columns', () => {
    const { errors } = parseProductCsv('name,dose\nFoo,10mg')
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /Missing required column/)
  })

  test('flags per-row validation errors and continues', () => {
    const csv = [
      'name,sku,unitCost,srp',
      ',MISSING-NAME,1,2', // missing name
      'Good,GOOD-1,10,20', // ok
      'Bad,BAD-1,abc,20', // bad cost
    ].join('\n')
    const { rows, errors } = parseProductCsv(csv)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sku, 'GOOD-1')
    assert.equal(errors.length, 2)
  })

  test('flags duplicate SKUs within the file', () => {
    const csv = ['name,sku,unitCost,srp', 'A,DUP,1,2', 'B,dup,3,4'].join('\n')
    const { rows, errors } = parseProductCsv(csv)
    assert.equal(rows.length, 1)
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /duplicate sku/)
  })

  test('imports a cost-only catalog (no srp column), defaulting srp to 0', () => {
    const csv = ['name,sku,dose,unitCost,supplierSku', 'Tirzepatide,TR5,5mg,$4.20,TR5'].join('\n')
    const { rows, errors } = parseProductCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].unitCost, 4.2)
    assert.equal(rows[0].srp, 0)
    assert.equal(rows[0].supplierSku, 'TR5')
  })

  test('template round-trips through the parser', () => {
    const { rows, errors } = parseProductCsv(productImportTemplate())
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sku, 'TES-10')
  })
})
