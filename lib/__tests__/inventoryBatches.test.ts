import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateCreateInput,
  planAllocation,
  BatchValidationError,
  type AllocatableBatch,
} from '../inventory-batches-core.ts'

describe('validateCreateInput', () => {
  const base = { name: 'Tesamorelin', dose: '10mg', bud: '2027-07-11', qtyReceived: 100 }

  test('accepts a valid receipt', () => {
    assert.doesNotThrow(() => validateCreateInput({ ...base }))
  })

  test('rejects non-positive amount', () => {
    assert.throws(() => validateCreateInput({ ...base, qtyReceived: 0 }), BatchValidationError)
    assert.throws(() => validateCreateInput({ ...base, qtyReceived: -5 }), BatchValidationError)
  })

  test('rejects damaged exceeding received', () => {
    assert.throws(
      () => validateCreateInput({ ...base, qtyDamaged: 101 }),
      /Damaged count cannot exceed/
    )
  })

  test('requires name + dose when no variantId', () => {
    assert.throws(() => validateCreateInput({ ...base, name: '' }), /Product name is required/)
    assert.throws(() => validateCreateInput({ ...base, dose: '' }), /Dose is required/)
  })

  test('skips name/dose requirement when variantId provided', () => {
    assert.doesNotThrow(() =>
      validateCreateInput({ variantId: 'v1', bud: '2027-07-11', qtyReceived: 10 })
    )
  })

  test('rejects malformed accent color and BUD', () => {
    assert.throws(() => validateCreateInput({ ...base, yearColor: 'blue' }), /hex value/)
    assert.throws(() => validateCreateInput({ ...base, bud: 'nope' }))
  })
})

describe('planAllocation (FIFO by BUD)', () => {
  const mk = (id: string, bud: string, qtyOnHand: number): AllocatableBatch => ({
    id,
    batchNumber: id,
    bud: new Date(`${bud}T00:00:00.000Z`),
    qtyOnHand,
  })

  test('draws from the soonest BUD first', () => {
    const batches = [mk('B', '2027-12-01', 50), mk('A', '2027-06-01', 30), mk('C', '2028-01-01', 50)]
    const plan = planAllocation(batches, 60)
    assert.deepEqual(
      plan.draws.map((d) => [d.batchId, d.qty]),
      [
        ['A', 30],
        ['B', 30],
      ]
    )
    assert.equal(plan.allocated, 60)
    assert.equal(plan.shortfall, 0)
  })

  test('reports a shortfall when stock is insufficient', () => {
    const batches = [mk('A', '2027-06-01', 10)]
    const plan = planAllocation(batches, 25)
    assert.equal(plan.allocated, 10)
    assert.equal(plan.shortfall, 15)
  })

  test('ignores empty batches', () => {
    const batches = [mk('A', '2027-06-01', 0), mk('B', '2027-07-01', 5)]
    const plan = planAllocation(batches, 5)
    assert.deepEqual(
      plan.draws.map((d) => d.batchId),
      ['B']
    )
  })
})
