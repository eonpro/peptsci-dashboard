import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCompetitorCsv,
  competitorImportTemplate,
} from '../competitor-import.ts'

describe('parseCompetitorCsv', () => {
  test('parses valid rows with aliases', () => {
    const csv = [
      'Competitor,Product,Dose,Their Price,Our SRP',
      'CompoundingRx,Semaglutide,10mg,$450.00,$399.00',
    ].join('\n')
    const { rows, errors } = parseCompetitorCsv(csv)
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].competitor, 'CompoundingRx')
    assert.equal(rows[0].product, 'Semaglutide')
    assert.equal(rows[0].dose, '10mg')
    assert.equal(rows[0].theirPrice, 450)
    assert.equal(rows[0].ourSrp, 399)
  })

  test('requires competitor and product columns', () => {
    const { rows, errors } = parseCompetitorCsv('foo,bar\n1,2')
    assert.equal(rows.length, 0)
    assert.match(errors[0].message, /Missing required column/)
  })

  test('flags missing required values per row', () => {
    const csv = ['competitor,product,theirPrice,ourSrp', ',Semaglutide,450,399'].join('\n')
    const { rows, errors } = parseCompetitorCsv(csv)
    assert.equal(rows.length, 0)
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /competitor is required/)
  })

  test('detects duplicate (competitor, product, dose) within file', () => {
    const csv = [
      'competitor,product,dose,theirPrice,ourSrp',
      'A,Sema,10mg,1,2',
      'A,Sema,10mg,3,4',
    ].join('\n')
    const { rows, errors } = parseCompetitorCsv(csv)
    assert.equal(rows.length, 1)
    assert.equal(errors.length, 1)
    assert.match(errors[0].message, /duplicate/)
  })

  test('template round-trips through the parser', () => {
    const { rows, errors } = parseCompetitorCsv(competitorImportTemplate())
    assert.equal(errors.length, 0)
    assert.equal(rows.length, 1)
  })
})
