import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BAC_WATER_SKUS } from '../shop/bac-water'
import { planOrderVialLabelLine } from '../labels/order-vial-labels'

describe('planOrderVialLabelLine', () => {
  it('skips Hospira 30mL so the order sheet does not print a PeptSci label', () => {
    assert.deepEqual(
      planOrderVialLabelLine({
        name: 'Bacteriostatic Water',
        dose: '30mL',
        sku: BAC_WATER_SKUS.hospira30ml,
        needed: 2,
        drawnQty: 0,
      }),
      { skip: true, useBatchDraws: false, syntheticBacQty: 0, volume: null }
    )
  })

  it('prints 3mL and 10mL from the order qty when no batch has been received', () => {
    assert.deepEqual(
      planOrderVialLabelLine({
        name: 'Bacteriostatic Water',
        dose: '3mL',
        sku: BAC_WATER_SKUS.labeled3ml,
        needed: 4,
        drawnQty: 0,
      }),
      { skip: false, useBatchDraws: false, syntheticBacQty: 4, volume: '3mL' }
    )
    assert.deepEqual(
      planOrderVialLabelLine({
        name: 'Bacteriostatic Water',
        dose: '10mL',
        sku: BAC_WATER_SKUS.labeled10ml,
        needed: 1,
        drawnQty: 0,
      }),
      { skip: false, useBatchDraws: false, syntheticBacQty: 1, volume: '10mL' }
    )
  })

  it('fills the 3mL/10mL shortfall after any batch draws', () => {
    const plan = planOrderVialLabelLine({
      name: 'Bacteriostatic Water',
      dose: '10mL',
      sku: BAC_WATER_SKUS.labeled10ml,
      needed: 5,
      drawnQty: 2,
    })
    assert.equal(plan.useBatchDraws, true)
    assert.equal(plan.syntheticBacQty, 3)
    assert.equal(plan.volume, '10mL')
  })

  it('leaves peptide lines on the batch-only path', () => {
    assert.deepEqual(
      planOrderVialLabelLine({
        name: 'BPC-157',
        dose: '10mg',
        sku: 'BPC-10',
        needed: 3,
        drawnQty: 0,
      }),
      { skip: false, useBatchDraws: true, syntheticBacQty: 0, volume: null }
    )
  })
})
