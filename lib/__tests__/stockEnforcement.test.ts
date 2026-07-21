import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { stockEnforcementEnabled } from '../stock-enforcement'

const ORIGINAL = process.env.CHECKOUT_ENFORCE_STOCK

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CHECKOUT_ENFORCE_STOCK
  else process.env.CHECKOUT_ENFORCE_STOCK = ORIGINAL
})

describe('stockEnforcementEnabled', () => {
  test('defaults ON when the env var is unset', () => {
    delete process.env.CHECKOUT_ENFORCE_STOCK
    assert.equal(stockEnforcementEnabled(), true)
  })

  test('stays ON for explicit "true"', () => {
    process.env.CHECKOUT_ENFORCE_STOCK = 'true'
    assert.equal(stockEnforcementEnabled(), true)
  })

  test('only the explicit "false" escape hatch disables enforcement', () => {
    process.env.CHECKOUT_ENFORCE_STOCK = 'false'
    assert.equal(stockEnforcementEnabled(), false)
  })

  test('unrecognized values fail safe (enforcement stays ON)', () => {
    process.env.CHECKOUT_ENFORCE_STOCK = '0'
    assert.equal(stockEnforcementEnabled(), true)
    process.env.CHECKOUT_ENFORCE_STOCK = ''
    assert.equal(stockEnforcementEnabled(), true)
  })
})
