import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_RATE_BPS,
  bpsToPercent,
  percentToBps,
  dollarsToCents,
  validateOrgRateBps,
  validateRepRateBps,
  computeCommissionSplit,
  computeMarginSplit,
  summarizeCommissionRows,
  reversalDelta,
  validateSellAboveFloor,
  formatCents,
  formatBps,
} from '../partners/commission'
import {
  generateReferralCode,
  isValidReferralCode,
  attributionFromLink,
} from '../partners/referral'

describe('bps conversions', () => {
  it('round-trips percentages', () => {
    assert.equal(bpsToPercent(750), 7.5)
    assert.equal(percentToBps(7.5), 750)
    assert.equal(percentToBps(10), 1000)
  })

  it('dollarsToCents rounds correctly', () => {
    assert.equal(dollarsToCents(123.45), 12345)
    assert.equal(dollarsToCents(0.1 + 0.2), 30)
  })
})

describe('rate validation', () => {
  it('accepts valid org rates', () => {
    assert.equal(validateOrgRateBps(0), null)
    assert.equal(validateOrgRateBps(MAX_RATE_BPS), null)
  })

  it('rejects invalid org rates', () => {
    assert.notEqual(validateOrgRateBps(-1), null)
    assert.notEqual(validateOrgRateBps(MAX_RATE_BPS + 1), null)
    assert.notEqual(validateOrgRateBps(7.5), null)
  })

  it('rep rate cannot exceed org rate', () => {
    assert.equal(validateRepRateBps(500, 1000), null)
    assert.notEqual(validateRepRateBps(1001, 1000), null)
    assert.notEqual(validateRepRateBps(-1, 1000), null)
  })
})

describe('computeCommissionSplit', () => {
  it('org-only attribution yields a single entry', () => {
    const entries = computeCommissionSplit({ revenueCents: 100_00, orgRateBps: 1000 })
    assert.deepEqual(entries, [{ payee: 'ORG', rateBps: 1000, amountCents: 10_00 }])
  })

  it('rep carve-out comes out of the org total, summing exactly', () => {
    const entries = computeCommissionSplit({
      revenueCents: 33_333, // $333.33
      orgRateBps: 1000, // 10%
      repRateBps: 300, // 3% carve-out
    })
    const total = entries.reduce((s, e) => s + e.amountCents, 0)
    assert.equal(total, Math.round((33_333 * 1000) / MAX_RATE_BPS))
    const rep = entries.find((e) => e.payee === 'REP')!
    assert.equal(rep.amountCents, Math.round((33_333 * 300) / MAX_RATE_BPS))
    const org = entries.find((e) => e.payee === 'ORG')!
    assert.equal(org.rateBps, 700)
  })

  it('rejects a rep rate above the org rate', () => {
    assert.throws(() =>
      computeCommissionSplit({ revenueCents: 100, orgRateBps: 500, repRateBps: 600 })
    )
  })

  it('rejects fractional revenue', () => {
    assert.throws(() => computeCommissionSplit({ revenueCents: 10.5, orgRateBps: 500 }))
  })
})

describe('computeMarginSplit', () => {
  it('org keeps the full margin with no rep', () => {
    assert.deepEqual(computeMarginSplit({ marginCents: 5000 }), [
      { payee: 'ORG', rateBps: MAX_RATE_BPS, amountCents: 5000 },
    ])
  })

  it('rep carve-out sums to the margin exactly', () => {
    const entries = computeMarginSplit({ marginCents: 3333, repRateBps: 2500 })
    const total = entries.reduce((s, e) => s + e.amountCents, 0)
    assert.equal(total, 3333)
    assert.equal(entries.find((e) => e.payee === 'REP')!.amountCents, Math.round(3333 * 0.25))
  })
})

describe('summarizeCommissionRows', () => {
  const rows = [
    { payee: 'ORG' as const, status: 'PENDING' as const, totalCents: 100 },
    { payee: 'ORG' as const, status: 'PAID' as const, totalCents: 200 },
    { payee: 'REP' as const, status: 'PENDING' as const, totalCents: 50 },
    { payee: 'REP' as const, status: 'PAID' as const, totalCents: 25 },
  ]

  it('org viewer sees own totals plus rep carve-out', () => {
    const s = summarizeCommissionRows(rows, 'ORG')
    assert.deepEqual(s, { ownCents: 300, repCents: 75, unpaidCents: 100, paidCents: 200 })
  })

  it('rep viewer sees only their share', () => {
    const s = summarizeCommissionRows(rows, 'REP')
    assert.deepEqual(s, { ownCents: 75, repCents: 0, unpaidCents: 50, paidCents: 25 })
  })
})

describe('reversalDelta', () => {
  it('partial refund reverses proportionally', () => {
    const delta = reversalDelta({
      earningCents: 1000,
      alreadyReversedCents: 0,
      revenueCents: 10_000,
      refundedTotalCents: 5_000,
    })
    assert.equal(delta, 500)
  })

  it('is cumulative — a second call after partial reversal returns the remainder', () => {
    const delta = reversalDelta({
      earningCents: 1000,
      alreadyReversedCents: 500,
      revenueCents: 10_000,
      refundedTotalCents: 10_000,
    })
    assert.equal(delta, 500)
  })

  it('full refund nets the earning to exactly zero', () => {
    const delta = reversalDelta({
      earningCents: 333,
      alreadyReversedCents: 0,
      revenueCents: 999,
      refundedTotalCents: 999,
    })
    assert.equal(delta, 333)
  })

  it('never un-reverses', () => {
    const delta = reversalDelta({
      earningCents: 1000,
      alreadyReversedCents: 800,
      revenueCents: 10_000,
      refundedTotalCents: 5_000,
    })
    assert.equal(delta, 0)
  })

  it('zero revenue or earning is a no-op', () => {
    assert.equal(
      reversalDelta({ earningCents: 0, alreadyReversedCents: 0, revenueCents: 100, refundedTotalCents: 100 }),
      0
    )
    assert.equal(
      reversalDelta({ earningCents: 100, alreadyReversedCents: 0, revenueCents: 0, refundedTotalCents: 0 }),
      0
    )
  })
})

describe('validateSellAboveFloor', () => {
  it('accepts prices at or above the floor', () => {
    assert.equal(validateSellAboveFloor(1000, 1000), null)
    assert.equal(validateSellAboveFloor(1001, 1000), null)
    assert.equal(validateSellAboveFloor(1000, null), null)
  })

  it('rejects below-floor and invalid prices', () => {
    assert.notEqual(validateSellAboveFloor(999, 1000), null)
    assert.notEqual(validateSellAboveFloor(-1, null), null)
    assert.notEqual(validateSellAboveFloor(10.5, null), null)
  })
})

describe('formatting', () => {
  it('formats cents as USD', () => {
    assert.equal(formatCents(123456), '$1,234.56')
  })

  it('formats bps as a clean percentage', () => {
    assert.equal(formatBps(750), '7.5%')
    assert.equal(formatBps(1000), '10%')
    assert.equal(formatBps(333), '3.33%')
  })
})

describe('referral helpers', () => {
  it('generates valid 10-char codes', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateReferralCode()
      assert.equal(code.length, 10)
      assert.ok(isValidReferralCode(code))
      assert.ok(!/[0o1l]/.test(code))
    }
  })

  it('rejects malformed codes', () => {
    assert.equal(isValidReferralCode(''), false)
    assert.equal(isValidReferralCode('ab'), false)
    assert.equal(isValidReferralCode('has spaces!'), false)
  })

  it('attribution only flows from active links', () => {
    assert.equal(attributionFromLink(null), null)
    assert.equal(
      attributionFromLink({ id: 'l1', orgId: 'o1', repId: null, active: false }),
      null
    )
    assert.deepEqual(attributionFromLink({ id: 'l1', orgId: 'o1', repId: 'r1', active: true }), {
      referralLinkId: 'l1',
      partnerOrgId: 'o1',
      partnerRepId: 'r1',
    })
  })
})
