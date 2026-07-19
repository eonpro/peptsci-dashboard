/**
 * Clinic-to-clinic referral store credit.
 *
 * A clinic shares its referral link (/refer/<code>); clinics that sign up
 * through it are stamped `Client.referredByClientId`. The referrer then earns
 * CLINIC_REFERRAL_RATE_BPS (default 5%) of every captured purchase the
 * referred clinic makes, as store credit redeemable at checkout.
 *
 * Ledger design (ClientCreditEntry): signed integer cents; balance = SUM.
 *   EARNED     +  at capture of a referred clinic's order (idempotent per order)
 *   REVERSED   −  proportional clawback when that order is refunded
 *   REDEEMED   −  credit applied to the clinic's own order (at capture/submit)
 *   UNREDEEMED +  credit restored when an order that used credit is refunded
 *   ADJUSTMENT ±  manual admin grant/correction
 *
 * All hooks are best-effort from the caller's perspective: failures are
 * logged, never thrown into the payment flow. Idempotency comes from unique
 * `reference` values; concurrent duplicates lose the unique race → no-op.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { reversalDelta, dollarsToCents } from '@/lib/partners/commission'

/** Cookie carrying a clinic-to-clinic referral code from /refer/<code> to signup. */
export const CLINIC_REF_COOKIE = 'ps_cref'

/** Referral earn rate in basis points (500 = 5%). Env-overridable. */
export const CLINIC_REFERRAL_RATE_BPS = (() => {
  const raw = Number(process.env.CLINIC_REFERRAL_RATE_BPS)
  return Number.isInteger(raw) && raw >= 0 && raw <= 10_000 ? raw : 500
})()

const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}

function generateCode(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return code
}

/** The clinic's referral code, generating + persisting one on first use. */
export async function getOrCreateReferralCode(clientId: string): Promise<string> {
  if (!prisma) throw new Error('Database not connected')
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { referralCode: true },
  })
  if (!client) throw new Error('Client not found')
  if (client.referralCode) return client.referralCode

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const updated = await prisma.client.update({
        where: { id: clientId },
        data: { referralCode: generateCode() },
        select: { referralCode: true },
      })
      return updated.referralCode!
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 2) throw err
    }
  }
  throw new Error('Could not generate referral code')
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')

export function clinicReferralUrl(code: string): string {
  return `${APP_URL}/refer/${code}`
}

/** Current credit balance in integer cents (never negative in practice). */
export async function creditBalanceCents(
  clientId: string,
  tx?: Pick<NonNullable<typeof prisma>, 'clientCreditEntry'>
): Promise<number> {
  const db = tx ?? prisma
  if (!db) return 0
  const agg = await db.clientCreditEntry.aggregate({
    where: { clientId },
    _sum: { amountCents: true },
  })
  return agg._sum.amountCents ?? 0
}

/**
 * Earn referral credit for a captured order placed by a referred clinic.
 * Idempotent per order (unique reference "earn:order:<id>"). The earn base is
 * the order total NET of any store credit the buyer applied (creditApplied is
 * excluded so credit never compounds into more credit).
 */
export async function earnReferralCreditForOrder(orderId: string): Promise<void> {
  if (!prisma || CLINIC_REFERRAL_RATE_BPS <= 0) return
  try {
    const reference = `earn:order:${orderId}`
    const existing = await prisma.clientCreditEntry.findUnique({
      where: { reference },
      select: { id: true },
    })
    if (existing) return

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        total: true,
        orderNumber: true,
        client: {
          select: {
            id: true,
            organizationName: true,
            referredByClientId: true,
            referredBy: { select: { id: true, onboardingStatus: true } },
          },
        },
      },
    })
    if (!order?.client.referredBy) return
    // A rejected/suspended referrer stops earning (credit is a live-account perk).
    if (order.client.referredBy.onboardingStatus !== 'APPROVED') return

    const baseCents = dollarsToCents(Number(order.total))
    const earnCents = Math.round((baseCents * CLINIC_REFERRAL_RATE_BPS) / 10_000)
    if (earnCents <= 0) return

    await prisma.clientCreditEntry.create({
      data: {
        clientId: order.client.referredBy.id,
        amountCents: earnCents,
        kind: 'EARNED',
        sourceClientId: order.client.id,
        orderId,
        reference,
        note: `${CLINIC_REFERRAL_RATE_BPS / 100}% referral credit — ${order.client.organizationName} order #${order.orderNumber}`,
      },
    })
    logger.info('[REFERRAL CREDIT] Earned', {
      orderId,
      earnerClientId: order.client.referredBy.id,
      earnCents,
    })
  } catch (err) {
    if (isUniqueViolation(err)) return
    logger.warn('[REFERRAL CREDIT] earn failed (non-blocking)', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Claw back earned credit proportionally to the order's cumulative refunds,
 * and restore any credit the BUYER redeemed on the refunded order. Safe to
 * call repeatedly (cumulative-position references).
 */
export async function reverseReferralCreditForOrder(orderId: string): Promise<void> {
  if (!prisma) return
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { total: true, refundedTotal: true, creditApplied: true, clientId: true, orderNumber: true },
    })
    if (!order) return
    const totalCents = dollarsToCents(Number(order.total))
    const refundedCents = Math.min(dollarsToCents(Number(order.refundedTotal ?? 0)), totalCents)
    if (refundedCents <= 0) return

    // ── Referrer clawback (proportional to refund fraction) ──
    const earned = await prisma.clientCreditEntry.findUnique({
      where: { reference: `earn:order:${orderId}` },
    })
    if (earned) {
      const reversedAgg = await prisma.clientCreditEntry.aggregate({
        where: { orderId, kind: 'REVERSED', clientId: earned.clientId },
        _sum: { amountCents: true },
      })
      const alreadyReversed = -(reversedAgg._sum.amountCents ?? 0)
      const delta = reversalDelta({
        earningCents: earned.amountCents,
        alreadyReversedCents: alreadyReversed,
        revenueCents: totalCents,
        refundedTotalCents: refundedCents,
      })
      if (delta > 0) {
        await prisma.clientCreditEntry
          .create({
            data: {
              clientId: earned.clientId,
              amountCents: -delta,
              kind: 'REVERSED',
              sourceClientId: earned.sourceClientId,
              orderId,
              reference: `rev:order:${orderId}:${alreadyReversed + delta}`,
              note: `Referral credit reversed — order #${order.orderNumber} refunded`,
            },
          })
          .catch((err) => {
            if (!isUniqueViolation(err)) throw err
          })
      }
    }

    // ── Buyer credit restore (only on FULL refund, all-or-nothing) ──
    const creditAppliedCents = dollarsToCents(Number(order.creditApplied ?? 0))
    if (creditAppliedCents > 0 && refundedCents >= totalCents) {
      await prisma.clientCreditEntry
        .create({
          data: {
            clientId: order.clientId,
            amountCents: creditAppliedCents,
            kind: 'UNREDEEMED',
            orderId,
            reference: `unredeem:order:${orderId}`,
            note: `Store credit restored — order #${order.orderNumber} fully refunded`,
          },
        })
        .catch((err) => {
          if (!isUniqueViolation(err)) throw err
        })
    }
  } catch (err) {
    logger.warn('[REFERRAL CREDIT] reversal failed (non-blocking)', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Record the redemption ledger row for an order that applied store credit.
 * Called when the order commits (card capture, terms submit, or zero-due
 * submit). Idempotent per order.
 */
export async function recordCreditRedemptionForOrder(orderId: string): Promise<void> {
  if (!prisma) return
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { creditApplied: true, clientId: true, orderNumber: true },
    })
    if (!order) return
    const creditCents = dollarsToCents(Number(order.creditApplied ?? 0))
    if (creditCents <= 0) return

    await prisma.clientCreditEntry.create({
      data: {
        clientId: order.clientId,
        amountCents: -creditCents,
        kind: 'REDEEMED',
        orderId,
        reference: `redeem:order:${orderId}`,
        note: `Store credit applied to order #${order.orderNumber}`,
      },
    })
    logger.info('[REFERRAL CREDIT] Redeemed', { orderId, creditCents })
  } catch (err) {
    if (isUniqueViolation(err)) return
    logger.warn('[REFERRAL CREDIT] redemption record failed (non-blocking)', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
