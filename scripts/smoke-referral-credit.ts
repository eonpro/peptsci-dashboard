/**
 * Smoke test for the clinic-referral store-credit flow against the local DB:
 * referral earn (5%) → idempotency → partial-refund clawback → checkout credit
 * clamp (incl. parallel-draft holds + Stripe minimum) → redemption → full-refund
 * restore. Cleans up after itself.
 *
 * Run: npx tsx --env-file=.env.local scripts/smoke-referral-credit.ts
 */

import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import {
  earnReferralCreditForOrder,
  reverseReferralCreditForOrder,
  recordCreditRedemptionForOrder,
  creditBalanceCents,
  getOrCreateReferralCode,
  CLINIC_REFERRAL_RATE_BPS,
} from '../lib/referrals/credit'
import { createDraftOrder, type ResolvedCart } from '../lib/stripe/checkout'

async function main() {
  if (!prisma) throw new Error('No DB connection')
  const stamp = Date.now()
  assert.equal(CLINIC_REFERRAL_RATE_BPS, 500, 'expected default 5% rate')

  const referrer = await prisma.client.create({
    data: { organizationName: `SmokeCR Referrer ${stamp}`, onboardingStatus: 'APPROVED' },
  })
  const code = await getOrCreateReferralCode(referrer.id)
  assert.ok(/^[a-z0-9]{10}$/.test(code))
  assert.equal(await getOrCreateReferralCode(referrer.id), code, 'code is stable')

  const referred = await prisma.client.create({
    data: {
      organizationName: `SmokeCR Referred ${stamp}`,
      onboardingStatus: 'APPROVED',
      referredByClientId: referrer.id,
    },
  })
  const user = await prisma.user.create({
    data: { clerkUserId: `smokecr-${stamp}`, role: 'ADMIN', status: 'ACTIVE' },
  })
  const product = await prisma.product.create({ data: { name: `SmokeCR Peptide ${stamp}` } })
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `SMOKECR-${stamp}`, unitCost: 10, srp: 100 },
  })

  const cleanupOrders: string[] = []
  try {
    // ── 1. Earn: referred clinic's $200 captured order → referrer +$10.
    const order = await prisma.order.create({
      data: {
        clientId: referred.id,
        createdById: user.id,
        subtotal: 200,
        total: 200,
        paymentStatus: 'CAPTURED',
        paidAt: new Date(),
      },
    })
    cleanupOrders.push(order.id)
    await earnReferralCreditForOrder(order.id)
    await earnReferralCreditForOrder(order.id) // idempotent
    assert.equal(await creditBalanceCents(referrer.id), 1000)
    console.log('✓ earn: $200 purchase → $10.00 credit (5%), idempotent')

    // ── 2. Partial refund claws back proportionally.
    await prisma.order.update({ where: { id: order.id }, data: { refundedTotal: 100 } })
    await reverseReferralCreditForOrder(order.id)
    await reverseReferralCreditForOrder(order.id) // idempotent
    assert.equal(await creditBalanceCents(referrer.id), 500)
    console.log('✓ reversal: 50% refund → balance $5.00, idempotent')

    // ── 3. Checkout clamp: referrer buys $100 with $5 credit → $95 due.
    const cart: ResolvedCart = {
      lines: [
        {
          variantId: variant.id,
          sku: variant.sku!,
          productName: product.name,
          dose: null,
          quantity: 1,
          unitPrice: 100,
          lineTotal: 100,
          isCustomPrice: false,
        },
      ],
      totals: { subtotal: 100, taxTotal: 0, shippingTotal: 0, total: 100 },
    }
    const creditOrder = await createDraftOrder({
      clientId: referrer.id,
      createdById: user.id,
      cart,
      requestedCreditCents: 100_00, // asks for more than the $5 balance
    })
    cleanupOrders.push(creditOrder.id)
    assert.equal(Number(creditOrder.creditApplied), 5)
    assert.equal(Number(creditOrder.total), 95)
    console.log('✓ clamp: requested $100 credit, applied $5 (real balance), $95 due')

    // ── 4. Parallel-draft hold: a second different cart can't reuse the same $5.
    const cart2: ResolvedCart = {
      ...cart,
      lines: [{ ...cart.lines[0], quantity: 2, lineTotal: 200 }],
      totals: { subtotal: 200, taxTotal: 0, shippingTotal: 0, total: 200 },
    }
    const heldOrder = await createDraftOrder({
      clientId: referrer.id,
      createdById: user.id,
      cart: cart2,
      requestedCreditCents: 200_00,
    })
    cleanupOrders.push(heldOrder.id)
    assert.equal(Number(heldOrder.creditApplied), 0, 'credit already held by the first draft')
    console.log('✓ hold: concurrent second draft gets $0 (credit held by first draft)')

    // ── 5. Redemption commits at capture; balance drains.
    await prisma.order.update({
      where: { id: creditOrder.id },
      data: { paymentStatus: 'CAPTURED', paidAt: new Date(), status: 'SUBMITTED' },
    })
    await recordCreditRedemptionForOrder(creditOrder.id)
    await recordCreditRedemptionForOrder(creditOrder.id) // idempotent
    assert.equal(await creditBalanceCents(referrer.id), 0)
    console.log('✓ redemption: $5 applied at capture, balance $0, idempotent')

    // ── 6. Full refund of the credit order restores the credit.
    await prisma.order.update({ where: { id: creditOrder.id }, data: { refundedTotal: 95 } })
    await reverseReferralCreditForOrder(creditOrder.id)
    assert.equal(await creditBalanceCents(referrer.id), 500)
    console.log('✓ restore: full refund returns the $5.00 redeemed credit')

    // ── 7. Stripe-minimum clamp: $100 order with $99.80 balance → leave $0.50.
    await prisma.clientCreditEntry.create({
      data: {
        clientId: referrer.id,
        amountCents: 9480, // bring balance to $99.80
        kind: 'ADJUSTMENT',
        note: 'smoke top-up',
        reference: `smokecr-adj-${stamp}`,
      },
    })
    const minOrder = await createDraftOrder({
      clientId: referrer.id,
      createdById: user.id,
      cart: {
        ...cart,
        lines: [{ ...cart.lines[0], quantity: 3, lineTotal: 300 }],
        totals: { subtotal: 100, taxTotal: 0, shippingTotal: 0, total: 100 },
      },
      requestedCreditCents: 100_00,
    })
    cleanupOrders.push(minOrder.id)
    assert.equal(Number(minOrder.creditApplied), 99.5)
    assert.equal(Number(minOrder.total), 0.5)
    console.log('✓ Stripe minimum: partial credit leaves $0.50 on the card')

    console.log('\nALL REFERRAL-CREDIT SMOKE CHECKS PASSED')
  } finally {
    for (const id of cleanupOrders.reverse()) {
      await prisma.orderItem.deleteMany({ where: { orderId: id } }).catch(() => {})
      await prisma.clientCreditEntry.deleteMany({ where: { orderId: id } }).catch(() => {})
      await prisma.order.delete({ where: { id } }).catch(() => {})
    }
    await prisma.client.delete({ where: { id: referred.id } }).catch(() => {})
    await prisma.client.delete({ where: { id: referrer.id } }).catch(() => {})
    await prisma.productVariant.delete({ where: { id: variant.id } }).catch(() => {})
    await prisma.product.delete({ where: { id: product.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err)
  process.exit(1)
})
