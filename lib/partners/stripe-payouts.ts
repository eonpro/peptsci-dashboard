/**
 * Automated partner payouts via Stripe Connect (Express).
 *
 * Env-gated behind PARTNER_STRIPE_PAYOUTS_ENABLED — with the flag off nothing
 * changes and money keeps moving manually (check/ACH recorded as before).
 *
 * Topology: PeptSci's Stripe key is a Connect PLATFORM key (clinic revenue
 * settles on a single connected account — see lib/stripe/connect.ts). Partner
 * orgs onboard as Express connected accounts; an automated payout is a
 * `transfers.create` from the PLATFORM balance to the org's account. NOTE:
 * because clinic charges settle on the operating connected account, the
 * platform balance must be funded (top-up or balance transfer) for these
 * transfers to succeed — Stripe rejects transfers exceeding available balance.
 *
 * Scope: ORG payouts only. Rep carve-outs are paid by their org / manually —
 * onboarding every individual rep to Express is a separate decision.
 */

import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { requireStripeClient } from '@/lib/stripe/config'
import { appUrl } from '@/lib/app-url'

export function partnerStripePayoutsEnabled(): boolean {
  return process.env.PARTNER_STRIPE_PAYOUTS_ENABLED === 'true'
}

export class PartnerPayoutStripeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    /** True when the transfer outcome is unknown (timeout) — do NOT unwind the ledger. */
    readonly unconfirmed = false
  ) {
    super(message)
    this.name = 'PartnerPayoutStripeError'
  }
}

/**
 * Create (once) the org's Express account and return a fresh onboarding link.
 * Safe to call repeatedly — Stripe account links are single-use and expire,
 * so each call mints a new link against the same account.
 */
export async function createConnectOnboardingLink(orgId: string): Promise<string> {
  if (!prisma) throw new PartnerPayoutStripeError('Database not connected', 'DB_UNAVAILABLE', 503)
  if (!partnerStripePayoutsEnabled()) {
    throw new PartnerPayoutStripeError('Stripe payouts are not enabled', 'FEATURE_DISABLED', 409)
  }
  const stripe = requireStripeClient()

  const org = await prisma.partnerOrg.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, contactEmail: true, stripeConnectAccountId: true },
  })
  if (!org) throw new PartnerPayoutStripeError('Partner org not found', 'NOT_FOUND', 404)

  let accountId = org.stripeConnectAccountId
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: org.contactEmail ?? undefined,
      business_profile: { name: org.name },
      capabilities: { transfers: { requested: true } },
      metadata: { partnerOrgId: org.id },
    })
    accountId = account.id
    await prisma.partnerOrg.update({
      where: { id: org.id },
      data: { stripeConnectAccountId: accountId },
    })
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: appUrl('/partners/payouts?stripe=refresh'),
    return_url: appUrl('/partners/payouts?stripe=connected'),
  })
  return link.url
}

/**
 * Mirror Stripe's `payouts_enabled` capability onto the org row. Called from
 * the `account.updated` webhook; unknown accounts are a no-op.
 */
export async function syncConnectAccountStatus(account: Stripe.Account): Promise<boolean> {
  if (!prisma) return false
  const res = await prisma.partnerOrg.updateMany({
    where: { stripeConnectAccountId: account.id },
    data: { stripePayoutsEnabled: Boolean(account.payouts_enabled) },
  })
  if (res.count > 0) {
    logger.info('[PARTNER STRIPE] account status synced', {
      accountId: account.id,
      payoutsEnabled: Boolean(account.payouts_enabled),
    })
  }
  return res.count > 0
}

/**
 * Execute the Stripe transfer for an already-recorded payout. Idempotent per
 * payout id. Throws PartnerPayoutStripeError; `unconfirmed: true` means the
 * outcome is unknown (network timeout) and the ledger must NOT be unwound.
 */
export async function executeStripeTransfer(payout: {
  id: string
  amountCents: number
  orgId: string
}): Promise<string> {
  if (!prisma) throw new PartnerPayoutStripeError('Database not connected', 'DB_UNAVAILABLE', 503)
  const stripe = requireStripeClient()

  const org = await prisma.partnerOrg.findUnique({
    where: { id: payout.orgId },
    select: { stripeConnectAccountId: true, stripePayoutsEnabled: true },
  })
  if (!org?.stripeConnectAccountId) {
    throw new PartnerPayoutStripeError(
      'This org has not connected a Stripe account for payouts.',
      'NO_CONNECT_ACCOUNT',
      409
    )
  }
  if (!org.stripePayoutsEnabled) {
    throw new PartnerPayoutStripeError(
      'The org’s Stripe account is not payout-enabled yet (onboarding incomplete).',
      'PAYOUTS_NOT_ENABLED',
      409
    )
  }

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: payout.amountCents,
        currency: 'usd',
        destination: org.stripeConnectAccountId,
        metadata: { partnerPayoutId: payout.id, partnerOrgId: payout.orgId },
      },
      { idempotencyKey: `partner_payout_${payout.id}` }
    )
    await prisma.partnerPayout.update({
      where: { id: payout.id },
      data: { stripeTransferId: transfer.id, reference: transfer.id },
    })
    return transfer.id
  } catch (err) {
    const stripeErr = err as { type?: string; message?: string }
    const message = stripeErr?.message || 'Stripe transfer failed'
    // Deterministic Stripe rejections (insufficient platform balance, bad
    // destination) are safe to unwind; connection/unknown errors are not —
    // the transfer may have gone through.
    const deterministic =
      stripeErr?.type === 'StripeInvalidRequestError' || stripeErr?.type === 'StripeCardError'
    logger.error('[PARTNER STRIPE] transfer failed', {
      payoutId: payout.id,
      orgId: payout.orgId,
      deterministic,
      message,
    })
    throw new PartnerPayoutStripeError(message, 'TRANSFER_FAILED', 502, !deterministic)
  }
}
