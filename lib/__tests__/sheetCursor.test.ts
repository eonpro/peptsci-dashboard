import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampStartSlot,
  fromOperatorPosition,
  toOperatorPosition,
} from '../labels/sheet-cursor'

describe('vial label sheet cursor helpers', () => {
  test('maps operator 1–36 to 0-based slots', () => {
    assert.equal(fromOperatorPosition(1), 0)
    assert.equal(fromOperatorPosition(3), 2)
    assert.equal(fromOperatorPosition(36), 35)
  })

  test('maps 0-based slots back to operator positions', () => {
    assert.equal(toOperatorPosition(0), 1)
    assert.equal(toOperatorPosition(2), 3)
    assert.equal(toOperatorPosition(35), 36)
  })

  test('clamp wraps past the end of the sheet', () => {
    assert.equal(clampStartSlot(36), 0)
    assert.equal(clampStartSlot(37), 1)
    assert.equal(clampStartSlot(-1), 35)
  })

  test('invalid operator positions fall back to slot 0', () => {
    assert.equal(fromOperatorPosition(0), 0)
    assert.equal(fromOperatorPosition(99), 0)
    assert.equal(fromOperatorPosition(Number.NaN), 0)
  })
})
