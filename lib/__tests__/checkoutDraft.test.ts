import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkoutCartFingerprint,
  selectSupersededDraftIds,
  paymentIntentIdFromClientSecret,
  isSupersededCheckoutDraft,
  SUPERSEDED_CHECKOUT_REASON,
} from '../checkout-draft.ts'

describe('checkoutCartFingerprint', () => {
  test('is order-independent so two drafts of the same cart match', () => {
    const a = checkoutCartFingerprint([
      { variantId: 'v2', quantity: 1, unitPrice: 70 },
      { variantId: 'v1', quantity: 2, unitPrice: 75 },
    ])
    const b = checkoutCartFingerprint([
      { variantId: 'v1', quantity: 2, unitPrice: 75 },
      { variantId: 'v2', quantity: 1, unitPrice: 70 },
    ])
    assert.equal(a, b)
  })

  test('treats quantity or price changes as a different cart', () => {
    const base = [{ variantId: 'v1', quantity: 2, unitPrice: 75 }]
    assert.notEqual(
      checkoutCartFingerprint(base),
      checkoutCartFingerprint([{ variantId: 'v1', quantity: 3, unitPrice: 75 }])
    )
  })
})

describe('selectSupersededDraftIds', () => {
  const items = [{ variantId: 'v1', quantity: 2, unitPrice: 75 }]
  const fingerprint = checkoutCartFingerprint(items)

  test('supersedes other drafts of the same cart (e.g. 2-day vs overnight)', () => {
    const ids = selectSupersededDraftIds(
      [
        { id: 'two-day', items },
        { id: 'overnight', items },
        { id: 'other-cart', items: [{ variantId: 'v9', quantity: 1, unitPrice: 10 }] },
      ],
      fingerprint,
      'overnight'
    )
    assert.deepEqual(ids, ['two-day'])
  })

  test('supersedes every matching draft when nothing is being kept yet', () => {
    const ids = selectSupersededDraftIds(
      [
        { id: 'a', items },
        { id: 'b', items },
      ],
      fingerprint,
      null
    )
    assert.deepEqual(ids.sort(), ['a', 'b'])
  })
})

describe('isSupersededCheckoutDraft', () => {
  test('matches failed drafts we abandoned for a newer checkout', () => {
    assert.equal(isSupersededCheckoutDraft('FAILED', SUPERSEDED_CHECKOUT_REASON), true)
    assert.equal(isSupersededCheckoutDraft('PENDING', SUPERSEDED_CHECKOUT_REASON), false)
    assert.equal(isSupersededCheckoutDraft('FAILED', 'Card declined'), false)
  })
})

describe('paymentIntentIdFromClientSecret', () => {
  test('strips the secret suffix', () => {
    assert.equal(
      paymentIntentIdFromClientSecret('pi_3AbcDef_secret_xyz'),
      'pi_3AbcDef'
    )
  })

  test('rejects garbage', () => {
    assert.equal(paymentIntentIdFromClientSecret(''), null)
    assert.equal(paymentIntentIdFromClientSecret('not-a-secret'), null)
  })
})
