/**
 * One-off smoke test for the partner program data flow against the local DB:
 * org + rep + attributed client → order accrual (10% org / 3% rep carve-out)
 * → partial refund reversal → approve → payout. Cleans up after itself.
 *
 * Run: DATABASE_URL=… npx tsx scripts/smoke-partners.ts
 */

import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { accrueCommissionForOrder, reverseCommissionForOrder, orderReference } from '../lib/partners/accrual'
import { commissionSummary, approvedBalance } from '../lib/partners/queries'

async function main() {
  if (!prisma) throw new Error('No DB connection')
  const stamp = Date.now()

  // ── Setup: org (ACTIVE, COMMISSION 10%), rep (ACTIVE, 3%), attributed client, user, order.
  const org = await prisma.partnerOrg.create({
    data: {
      name: `Smoke Org ${stamp}`,
      contactEmail: `smoke-${stamp}@example.com`,
      status: 'ACTIVE',
      compensationModel: 'COMMISSION',
      commissionRateBps: 1000,
    },
  })
  const rep = await prisma.partnerRep.create({
    data: {
      orgId: org.id,
      name: 'Smoke Rep',
      email: `smoke-rep-${stamp}@example.com`,
      status: 'ACTIVE',
      commissionRateBps: 300,
    },
  })
  const client = await prisma.client.create({
    data: {
      organizationName: `Smoke Clinic ${stamp}`,
      partnerOrgId: org.id,
      partnerRepId: rep.id,
    },
  })
  const user = await prisma.user.create({
    data: { clerkUserId: `smoke-${stamp}`, role: 'ADMIN', status: 'ACTIVE' },
  })
  const order = await prisma.order.create({
    data: {
      clientId: client.id,
      createdById: user.id,
      subtotal: 500,
      total: 500,
      paymentStatus: 'CAPTURED',
      paidAt: new Date(),
    },
  })

  try {
    // ── Accrual: $500 at 10% = $50 total; rep carve-out 3% = $15; org $35.
    await accrueCommissionForOrder(order.id)
    await accrueCommissionForOrder(order.id) // idempotent — must not duplicate

    const txn = await prisma.partnerTransaction.findUnique({
      where: { reference: orderReference(order.id) },
      include: { entries: true },
    })
    assert.ok(txn, 'transaction created')
    assert.equal(txn.revenueCents, 50_000)
    assert.equal(txn.entries.length, 2)
    const orgEntry = txn.entries.find((e) => e.payee === 'ORG')!
    const repEntry = txn.entries.find((e) => e.payee === 'REP')!
    assert.equal(orgEntry.amountCents, 35_000 / 10) // $35.00
    assert.equal(repEntry.amountCents, 15_000 / 10) // $15.00
    console.log('✓ accrual: $50 split $35 org / $15 rep, idempotent')

    const summary = await commissionSummary({ orgId: org.id }, 'ORG')
    assert.deepEqual(summary, { ownCents: 3500, repCents: 1500, unpaidCents: 3500, paidCents: 0 })
    console.log('✓ summary rollup matches')

    // ── Partial refund: $250 of $500 → half the commission reverses.
    await prisma.order.update({ where: { id: order.id }, data: { refundedTotal: 250 } })
    await reverseCommissionForOrder(order.id)
    await reverseCommissionForOrder(order.id) // idempotent — no extra reversals

    const afterRefund = await prisma.partnerTransaction.findUnique({
      where: { reference: orderReference(order.id) },
      include: { entries: true },
    })
    const reversals = afterRefund!.entries.filter((e) => e.kind === 'REVERSAL')
    assert.equal(reversals.length, 2)
    assert.equal(reversals.find((e) => e.payee === 'ORG')!.amountCents, 1750)
    assert.equal(reversals.find((e) => e.payee === 'REP')!.amountCents, 750)
    console.log('✓ reversal: 50% refund claws back $17.50 org / $7.50 rep, idempotent')

    const netSummary = await commissionSummary({ orgId: org.id }, 'ORG')
    assert.equal(netSummary.ownCents, 1750)
    assert.equal(netSummary.unpaidCents, 1750)

    // ── Approve all → payout balance = net approved.
    await prisma.commissionEntry.updateMany({
      where: { orgId: org.id, status: 'PENDING' },
      data: { status: 'APPROVED' },
    })
    const orgBalance = await approvedBalance(org.id, 'ORG')
    const repBalance = await approvedBalance(org.id, 'REP', rep.id)
    assert.equal(orgBalance.amountCents, 1750)
    assert.equal(repBalance.amountCents, 750)
    console.log('✓ approved balances: $17.50 org / $7.50 rep')

    // ── Payout flips entries to PAID; balance drains to zero.
    const payout = await prisma.$transaction(async (tx) => {
      const created = await tx.partnerPayout.create({
        data: {
          orgId: org.id,
          payee: 'ORG',
          amountCents: orgBalance.amountCents,
          recordedBy: 'smoke',
        },
      })
      await tx.commissionEntry.updateMany({
        where: { id: { in: orgBalance.entryIds }, status: 'APPROVED' },
        data: { status: 'PAID', payoutId: created.id },
      })
      return created
    })
    assert.equal(payout.amountCents, 1750)
    const drained = await approvedBalance(org.id, 'ORG')
    assert.equal(drained.amountCents, 0)
    const paidSummary = await commissionSummary({ orgId: org.id }, 'ORG')
    assert.equal(paidSummary.paidCents, 1750)
    assert.equal(paidSummary.unpaidCents, 0)
    console.log('✓ payout: entries flipped PAID, balance drained, summary reflects it')

    console.log('\nALL SMOKE CHECKS PASSED')
  } finally {
    // Cleanup (cascades take out reps/links/transactions/entries/payouts).
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
    await prisma.client.delete({ where: { id: client.id } }).catch(() => {})
    await prisma.partnerOrg.delete({ where: { id: org.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err)
  process.exit(1)
})
