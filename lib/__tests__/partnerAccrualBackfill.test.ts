import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isPartnerAccrualBackfillCandidate } from '../ops/backfill-partner-accrual'
import { orderReference } from '../partners/accrual'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('isPartnerAccrualBackfillCandidate', () => {
  const base = {
    paymentStatus: 'CAPTURED',
    status: 'SUBMITTED',
    partnerOrgId: 'org_1',
    total: 100,
  }

  it('accepts captured attributed positive orders', () => {
    assert.equal(isPartnerAccrualBackfillCandidate(base), true)
  })

  it('rejects non-captured, cancelled/draft, unattributed, or zero total', () => {
    assert.equal(
      isPartnerAccrualBackfillCandidate({ ...base, paymentStatus: 'PENDING' }),
      false
    )
    assert.equal(isPartnerAccrualBackfillCandidate({ ...base, status: 'CANCELLED' }), false)
    assert.equal(isPartnerAccrualBackfillCandidate({ ...base, status: 'DRAFT' }), false)
    assert.equal(
      isPartnerAccrualBackfillCandidate({ ...base, partnerOrgId: null }),
      false
    )
    assert.equal(isPartnerAccrualBackfillCandidate({ ...base, total: 0 }), false)
    assert.equal(isPartnerAccrualBackfillCandidate({ ...base, total: -1 }), false)
  })
})

describe('orderReference', () => {
  it('uses order:<id> ledger key', () => {
    assert.equal(orderReference('abc'), 'order:abc')
  })
})

describe('partner accrual wired on CAPTURED mint paths', () => {
  const paths = [
    'app/api/admin/fulfillment/stripe-convert/route.ts',
    'lib/invoicing/fulfill-products.ts',
    'lib/shopify/process-inbound.ts',
  ]

  for (const rel of paths) {
    it(`calls accrueCommissionForOrder in ${rel}`, () => {
      const src = readFileSync(join(root, rel), 'utf8')
      assert.match(src, /accrueCommissionForOrder/)
      assert.match(src, /partners\/accrual/)
    })
  }
})
