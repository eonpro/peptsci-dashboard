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

  test('imports a cost-only catalog (no srp column), leaving srp absent', () => {
    const csv = ['name,sku,dose,unitCost,supplierSku', 'Tirzepatide,TR5,5mg,$4.20,TR5'].join('\n')
    const { rows, errors } = parseProductCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].unitCost, 4.2)
    // Absent price columns stay undefined so re-imports never zero out prices.
    assert.equal(rows[0].srp, undefined)
    assert.equal(rows[0].supplierSku, 'TR5')
  })

  test('template round-trips through the parser', () => {
    const { rows, errors } = parseProductCsv(productImportTemplate())
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].sku, 'TES-10')
    assert.equal(rows[0].casNumber, '218949-48-5')
    assert.equal(rows[0].molecularWeight, 5135.9)
  })

  test('parses the PeptSci catalog sheet headers as-is', () => {
    const header = [
      'SKU',
      'Peptide Name',
      'Miligrams',
      'Cost/Unit',
      'Category',
      'CAS Number',
      'Molecular Formula',
      'Molecular Weight (g/mol)',
      'PubChem CID',
      'Peptide Length',
      'Description',
      'AKA',
      'Monoisotopic Mass',
      'Complexity',
      'XLogP',
      'Hydrogen Bond Donor Count',
      'Hydrogen Bond Acceptor Count',
      'Rotatable Bond Count',
      'Heavy Atom Count',
      'Intended Use',
      'PubChem Laboratory Chemical Safety Summary (LCSS)',
      'Current Inventory',
    ].join(',')
    const row = [
      'TES-10',
      'Tesamorelin',
      '10',
      '$45.00',
      'Peptides',
      '218949-48-5',
      'C221H366N72O67S',
      '5135.9',
      '44147413',
      '44',
      '"GHRH analog, research grade"',
      'TH9507; Egrifta',
      '5132.7',
      '11400',
      '-14.4',
      '73',
      '75',
      '182',
      '361',
      'Research use only',
      'See PubChem LCSS',
      '12',
    ].join(',')

    const { rows, errors } = parseProductCsv(`${header}\n${row}`)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    const r = rows[0]
    assert.equal(r.sku, 'TES-10')
    assert.equal(r.name, 'Tesamorelin')
    assert.equal(r.dose, '10mg') // bare number under a Milligrams header gets mg suffix
    assert.equal(r.unitCost, 45)
    assert.equal(r.srp, undefined) // no price column: stays absent (never overwrites)
    assert.equal(r.category, 'Peptides')
    assert.equal(r.casNumber, '218949-48-5')
    assert.equal(r.molecularFormula, 'C221H366N72O67S')
    assert.equal(r.molecularWeight, 5135.9)
    assert.equal(r.pubchemCid, '44147413')
    assert.equal(r.peptideLength, 44)
    assert.equal(r.description, 'GHRH analog, research grade')
    assert.equal(r.aka, 'TH9507; Egrifta')
    assert.equal(r.monoisotopicMass, 5132.7)
    assert.equal(r.complexity, 11400)
    assert.equal(r.xlogp, -14.4)
    assert.equal(r.hydrogenBondDonorCount, 73)
    assert.equal(r.hydrogenBondAcceptorCount, 75)
    assert.equal(r.rotatableBondCount, 182)
    assert.equal(r.heavyAtomCount, 361)
    assert.equal(r.intendedUse, 'Research use only')
    assert.equal(r.safetySummary, 'See PubChem LCSS')
    assert.equal(r.inventoryOnHand, 12)
  })

  test('non-numeric scientific values are dropped without failing the row', () => {
    const csv = [
      'name,sku,cost,Molecular Weight (g/mol),Peptide Length,XLogP',
      'Foo,FOO-1,10,N/A,unknown,-2.1',
    ].join('\n')
    const { rows, errors } = parseProductCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].molecularWeight, undefined)
    assert.equal(rows[0].peptideLength, undefined)
    assert.equal(rows[0].xlogp, -2.1)
  })

  test('parses imageUrl aliases and drops junk values', () => {
    const csv = [
      'name,sku,cost,Image URL',
      'Foo,FOO-1,10,https://cdn.example.com/foo.jpg',
      'Bar,BAR-1,10,N/A',
      'Baz,BAZ-1,10,/images/baz.png',
    ].join('\n')
    const { rows, errors } = parseProductCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows[0].imageUrl, 'https://cdn.example.com/foo.jpg')
    assert.equal(rows[1].imageUrl, undefined)
    assert.equal(rows[2].imageUrl, '/images/baz.png')
  })

  test('keeps explicit dose strings untouched under an mg header', () => {
    const csv = ['name,sku,Milligrams,cost', 'Bar,BAR-1,5mg,3'].join('\n')
    const { rows } = parseProductCsv(csv)
    assert.equal(rows[0].dose, '5mg')
  })
})
