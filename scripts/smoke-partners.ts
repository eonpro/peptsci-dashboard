/**
 * One-off smoke test for the partner program data flow against the local DB:
 * org + rep + attributed client → order accrual (10% org / 3% rep carve-out)
 * → partial refund reversal → approve → payout. Cleans up after itself.
 *
 * Run: DATABASE_URL=… npx tsx scripts/smoke-partners.ts
 */

import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import {
  accrueCommissionForOrder,
  reverseCommissionForOrder,
  accrueManualTransaction,
  orderReference,
  effectiveOrgRateBps,
} from '../lib/partners/accrual'
import { matchLeadForNewClient, convertLead, LEAD_PROTECTION_DAYS } from '../lib/partners/leads'
import { commissionSummary, approvedBalance, clinicBook, monthlyTrend } from '../lib/partners/queries'
import { attributionFromLink, generateReferralCode } from '../lib/partners/referral'

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

    // ── Referral attribution: link → clinic stamp (the /join + onboarding path).
    const link = await prisma.referralLink.create({
      data: { code: generateReferralCode(), orgId: org.id, repId: rep.id, label: 'smoke' },
    })
    const attribution = attributionFromLink({
      id: link.id,
      orgId: link.orgId,
      repId: link.repId,
      active: link.active,
    })
    assert.ok(attribution)
    const clinic2 = await prisma.client.create({
      data: {
        organizationName: `Smoke Clinic B ${stamp}`,
        partnerOrgId: attribution.partnerOrgId,
        partnerRepId: attribution.partnerRepId,
        referralLinkId: attribution.referralLinkId,
      },
    })
    const stamped = await prisma.client.findUnique({
      where: { id: clinic2.id },
      select: { partnerOrgId: true, partnerRepId: true, referralLinkId: true },
    })
    assert.deepEqual(stamped, {
      partnerOrgId: org.id,
      partnerRepId: rep.id,
      referralLinkId: link.id,
    })
    console.log('✓ referral link attribution stamps org/rep/link onto the clinic')

    // ── Manual transaction (admin entry) + reference dedup (CSV re-import).
    const manual = await accrueManualTransaction({
      orgId: org.id,
      clientId: clinic2.id,
      transactionDate: new Date(),
      description: 'Smoke manual sale',
      reference: `smoke-ref-${stamp}`,
      revenueCents: 10_000, // $100 at 10% = $10; rep 3% = $3
      source: 'MANUAL',
      createdBy: 'smoke',
    })
    assert.ok(manual)
    const dup = await accrueManualTransaction({
      orgId: org.id,
      clientId: clinic2.id,
      transactionDate: new Date(),
      reference: `smoke-ref-${stamp}`,
      revenueCents: 10_000,
      source: 'CSV',
      createdBy: 'smoke',
    })
    assert.equal(dup, null, 'duplicate reference must be skipped')
    const manualTxn = await prisma.partnerTransaction.findUnique({
      where: { reference: `smoke-ref-${stamp}` },
      include: { entries: true },
    })
    assert.equal(manualTxn!.entries.find((e) => e.payee === 'ORG')!.amountCents, 700)
    assert.equal(manualTxn!.entries.find((e) => e.payee === 'REP')!.amountCents, 300)
    console.log('✓ manual transaction: $100 → $7 org / $3 rep, duplicate reference skipped')

    // ── Book of business + trend reflect both clinics.
    const book = await clinicBook({ orgId: org.id }, 'ORG')
    assert.equal(book.length, 2)
    const bookB = book.find((r) => r.clientId === clinic2.id)!
    assert.equal(bookB.revenueCents, 10_000)
    assert.equal(bookB.repName, 'Smoke Rep')
    const trend = await monthlyTrend({ orgId: org.id }, 'ORG', 3)
    const thisMonth = trend[trend.length - 1]
    assert.equal(thisMonth.revenueCents, 60_000) // $500 order + $100 manual
    console.log('✓ clinic book + monthly trend aggregate both transactions')

    // ── MARGIN model: floor-based accrual on a second org.
    const product = await prisma.product.create({ data: { name: `Smoke Peptide ${stamp}` } })
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, unitCost: 40, srp: 100 },
    })
    const marginOrg = await prisma.partnerOrg.create({
      data: {
        name: `Smoke Margin Org ${stamp}`,
        contactEmail: `smoke-margin-${stamp}@example.com`,
        status: 'ACTIVE',
        compensationModel: 'MARGIN',
      },
    })
    await prisma.partnerOrgPricing.create({
      data: { orgId: marginOrg.id, variantId: variant.id, floorCents: 6000 }, // $60 floor
    })
    const marginClinic = await prisma.client.create({
      data: { organizationName: `Smoke Margin Clinic ${stamp}`, partnerOrgId: marginOrg.id },
    })
    const marginOrder = await prisma.order.create({
      data: {
        clientId: marginClinic.id,
        createdById: user.id,
        subtotal: 170,
        total: 170,
        paymentStatus: 'CAPTURED',
        paidAt: new Date(),
        items: {
          create: [{ variantId: variant.id, quantity: 2, unitPrice: 85, totalPrice: 170 }],
        },
      },
    })
    try {
      // 2 × $85 sell − 2 × $60 floor = $50 margin, all to the org (no rep).
      await accrueCommissionForOrder(marginOrder.id)
      const marginTxn = await prisma.partnerTransaction.findUnique({
        where: { reference: orderReference(marginOrder.id) },
        include: { entries: true },
      })
      assert.ok(marginTxn)
      assert.equal(marginTxn.revenueCents, 17_000)
      assert.equal(marginTxn.costCents, 12_000)
      assert.equal(marginTxn.entries.length, 1)
      assert.equal(marginTxn.entries[0].payee, 'ORG')
      assert.equal(marginTxn.entries[0].amountCents, 5000)
      console.log('✓ margin model: 2×($85−$60 floor) = $50 spread accrued to the org')
    } finally {
      // FK order: items → order → clinic/org (cascades partner rows) → catalog.
      await prisma.orderItem.deleteMany({ where: { orderId: marginOrder.id } }).catch(() => {})
      await prisma.partnerOrg.delete({ where: { id: marginOrg.id } }).catch(() => {})
      await prisma.order.delete({ where: { id: marginOrder.id } }).catch(() => {})
      await prisma.client.delete({ where: { id: marginClinic.id } }).catch(() => {})
      await prisma.productVariant.delete({ where: { id: variant.id } }).catch(() => {})
      await prisma.product.delete({ where: { id: product.id } }).catch(() => {})
    }

    await prisma.client.delete({ where: { id: clinic2.id } }).catch(() => {})

    // ── Protected leads: register → match by email → convert.
    const lead = await prisma.partnerLead.create({
      data: {
        orgId: org.id,
        repId: rep.id,
        clinicName: 'Smoke Lead Clinic',
        email: `smoke-lead-${stamp}@example.com`,
        protectedUntil: new Date(Date.now() + LEAD_PROTECTION_DAYS * 86_400_000),
      },
    })
    const match = await matchLeadForNewClient({ email: `SMOKE-LEAD-${stamp}@example.com` })
    assert.ok(match, 'lead matches case-insensitively')
    assert.equal(match.orgId, org.id)
    assert.equal(match.repId, rep.id)
    const leadClinic = await prisma.client.create({
      data: {
        organizationName: `Smoke LeadClinic ${stamp}`,
        partnerOrgId: match.orgId,
        partnerRepId: match.repId,
      },
    })
    await convertLead(match.leadId, leadClinic.id)
    const converted = await prisma.partnerLead.findUnique({ where: { id: lead.id } })
    assert.equal(converted!.status, 'CONVERTED')
    assert.equal(converted!.matchedClientId, leadClinic.id)
    const noMatch = await matchLeadForNewClient({ email: `smoke-lead-${stamp}@example.com` })
    assert.equal(noMatch, null, 'converted leads stop matching')
    console.log('✓ leads: email match attributes org+rep, converts, and stops matching')
    await prisma.client.delete({ where: { id: leadClinic.id } }).catch(() => {})

    // ── Volume tiers: +2% once QTD revenue ≥ $100 (already earned $600 this quarter).
    await prisma.partnerRateTier.create({
      data: { orgId: org.id, thresholdCents: 10_000, bonusBps: 200 },
    })
    const boosted = await effectiveOrgRateBps(org.id, 1000)
    assert.equal(boosted, 1200, 'tier bonus applies once threshold reached')
    const unboosted = await effectiveOrgRateBps(org.id, 9950)
    assert.equal(unboosted, 10_000, 'boosted rate caps at 100%')
    console.log('✓ tiers: quarter-to-date volume bumps the effective rate (capped)')

    console.log('\nALL SMOKE CHECKS PASSED')
  } finally {
    // Cleanup (org cascade takes out reps/links/transactions/entries/payouts).
    await prisma.partnerOrg.delete({ where: { id: org.id } }).catch(() => {})
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
    await prisma.client.delete({ where: { id: client.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err)
  process.exit(1)
})
