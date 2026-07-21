import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { changedFields } from '../audit'

describe('changedFields', () => {
  test('reports only fields that actually changed', () => {
    const diff = changedFields(
      { name: 'Acme', rate: 1000, notes: 'x' },
      { name: 'Acme', rate: 1500 }
    )
    assert.deepEqual(diff, { rate: { from: 1000, to: 1500 } })
  })

  test('PATCH semantics: fields absent from `after` are not changes', () => {
    const diff = changedFields({ a: 1, b: 2 }, { a: 1 })
    assert.deepEqual(diff, {})
  })

  test('normalizes undefined to null so unset-vs-null is not a phantom change', () => {
    const diff = changedFields({ website: null }, { website: undefined })
    assert.deepEqual(diff, {})
  })

  test('captures nulling out a value', () => {
    const diff = changedFields({ website: 'https://a.com' }, { website: null })
    assert.deepEqual(diff, { website: { from: 'https://a.com', to: null } })
  })

  test('compares dates by ISO string', () => {
    const d1 = new Date('2026-01-01T00:00:00Z')
    const d2 = new Date('2026-01-01T00:00:00Z')
    const d3 = new Date('2026-02-01T00:00:00Z')
    assert.deepEqual(changedFields({ at: d1 }, { at: d2 }), {})
    assert.deepEqual(changedFields({ at: d1 }, { at: d3 }), {
      at: { from: d1.toISOString(), to: d3.toISOString() },
    })
  })

  test('boolean and status flips are captured', () => {
    const diff = changedFields(
      { status: 'PENDING', autoApproveEntries: true },
      { status: 'ACTIVE', autoApproveEntries: false }
    )
    assert.deepEqual(diff, {
      status: { from: 'PENDING', to: 'ACTIVE' },
      autoApproveEntries: { from: true, to: false },
    })
  })
})
