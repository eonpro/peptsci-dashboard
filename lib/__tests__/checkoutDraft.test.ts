import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkoutCartFingerprint,
  isReusableCheckoutDraft,
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

describe('isReusableCheckoutDraft', () => {
  const items = [{ variantId: 'v1', quantity: 2, unitPrice: 75 }]
  const draft = {
    shipTo: 'PRACTICE',
    shipSpeed: 'TWO_DAY',
    patientId: null,
    creditApplied: 0,
    labSuppliesTotal: 5,
    items,
  }
  const attempt = {
    shipTo: 'PRACTICE',
    shipSpeed: 'TWO_DAY',
    patientId: null,
    wantsCredit: false,
    labSuppliesTotal: 5,
    fingerprint: checkoutCartFingerprint(items),
  }

  test('reuses the draft for an identical checkout', () => {
    assert.equal(isReusableCheckoutDraft(draft, attempt), true)
  })

  test('never reuses a draft priced without the lab supplies charge', () => {
    assert.equal(isReusableCheckoutDraft({ ...draft, labSuppliesTotal: 0 }, attempt), false)
  })

  test('delivery, credit or cart changes mint a fresh draft', () => {
    assert.equal(isReusableCheckoutDraft({ ...draft, shipSpeed: 'OVERNIGHT' }, attempt), false)
    assert.equal(isReusableCheckoutDraft({ ...draft, patientId: 'pat_1' }, attempt), false)
    assert.equal(isReusableCheckoutDraft({ ...draft, creditApplied: 10 }, attempt), false)
    assert.equal(
      isReusableCheckoutDraft({ ...draft, creditApplied: 10 }, { ...attempt, wantsCredit: true }),
      true
    )
    assert.equal(
      isReusableCheckoutDraft(
        { ...draft, items: [{ variantId: 'v1', quantity: 3, unitPrice: 75 }] },
        attempt
      ),
      false
    )
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
