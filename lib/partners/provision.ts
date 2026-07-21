/**
 * Partner provisioning: approval + Clerk login invitations for org owners,
 * reps, and org members.
 *
 * The invitation's publicMetadata seeds { role: 'PARTNER', status: 'ACTIVE' }
 * plus the partner identity id; the Clerk webhook (app/api/webhooks/clerk)
 * stamps `clerkUserId` into the matching row when the invitee signs up.
 */

import { clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  isEmailEnabled,
  sendAffiliateApprovedEmail,
  sendAffiliateRejectedEmail,
  sendPartnerRepInviteEmail,
  sendPartnerTeamInviteEmail,
} from '@/lib/email'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://peptsci.com').replace(/\/$/, '')

export class PartnerProvisionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'PartnerProvisionError'
  }
}

function db() {
  if (!prisma) throw new PartnerProvisionError('Database not connected', 'DB_UNAVAILABLE', 503)
  return prisma
}

/**
 * Clerk invitation seeded with PARTNER role + the identity row to link.
 *
 * When our SES pipeline is live we suppress Clerk's generic "Invitation to
 * join" email (`notify: false`) and send a branded email carrying the
 * invitation URL instead. When email is disabled, Clerk's default email is the
 * only delivery channel, so we keep it on.
 *
 * @returns the Clerk accept-invitation URL when we own delivery, else null.
 */
async function createPartnerInvitation(
  email: string,
  identity: { partnerOrgId?: string; partnerRepId?: string; partnerMemberId?: string }
): Promise<string | null> {
  if (!isClerkConfigured) {
    logger.warn('[PARTNER PROVISION] Clerk not configured — skipping invitation', { email })
    return null
  }
  const weOwnDelivery = isEmailEnabled()
  const clerk = await clerkClient()
  try {
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role: 'PARTNER', status: 'ACTIVE', ...identity },
      redirectUrl: `${APP_URL}/sign-up`,
      ignoreExisting: false,
      notify: !weOwnDelivery,
    })
    if (weOwnDelivery && !invitation.url) {
      // Clerk email suppressed + no URL to embed = nobody has a link. Surface
      // it so ops can revoke + re-invite.
      logger.error('[PARTNER PROVISION] Clerk returned no invitation URL with notify:false', {
        email,
        invitationId: invitation.id,
      })
    }
    return weOwnDelivery ? (invitation.url ?? null) : null
  } catch (err) {
    const clerkErr = err as { errors?: Array<{ message?: string; code?: string }> }
    const first = clerkErr.errors?.[0]
    if (first) {
      throw new PartnerProvisionError(
        first.code === 'duplicate_record'
          ? 'An invitation for this email is already pending.'
          : first.message || 'Could not send the sign-up invitation.',
        'INVITE_FAILED',
        409
      )
    }
    throw err
  }
}

/**
 * Applicants who signed up before applying (e.g. they landed on the clinic
 * onboarding page first) already have a Clerk account, and Clerk rejects
 * invitations for existing emails. Instead of failing the approval, we grant
 * that account partner access directly: stamp PARTNER metadata + link the org.
 *
 * Guarded: never converts an admin, or an account already linked to a clinic —
 * those need a different contact email on the application.
 *
 * @returns true when an existing account was linked (no invitation needed).
 */
async function linkExistingClerkAccount(org: {
  id: string
  contactEmail: string
}): Promise<boolean> {
  if (!isClerkConfigured) return false
  const clerk = await clerkClient()
  const { data: users } = await clerk.users.getUserList({ emailAddress: [org.contactEmail] })
  const user = users[0]
  if (!user) return false

  const meta = (user.publicMetadata ?? {}) as { role?: string; clientId?: string }
  if (meta.role === 'ADMIN' || meta.role === 'SUPER_ADMIN') {
    throw new PartnerProvisionError(
      'The contact email belongs to a PeptSci admin account. Change the application contact email before approving.',
      'EMAIL_IS_ADMIN',
      409
    )
  }
  if (meta.clientId) {
    throw new PartnerProvisionError(
      'The contact email belongs to an existing clinic account. An account cannot be both a clinic and a partner — change the application contact email before approving.',
      'EMAIL_IS_CLINIC',
      409
    )
  }
  if (meta.role === 'PARTNER') {
    throw new PartnerProvisionError(
      'The contact email already belongs to a partner account (org, rep, or teammate). Change the application contact email before approving.',
      'EMAIL_IS_PARTNER',
      409
    )
  }

  // Metadata first, then the DB link: if the DB write fails, a retry finds the
  // org still unlinked and repeats this (idempotent) path.
  await clerk.users.updateUserMetadata(user.id, {
    publicMetadata: { role: 'PARTNER', status: 'ACTIVE', partnerOrgId: org.id },
  })
  await db().partnerOrg.update({ where: { id: org.id }, data: { clerkUserId: user.id } })
  // The user.updated webhook syncs this too; do it inline so access is
  // immediate even if webhook delivery lags or fails.
  await db()
    .user.updateMany({
      where: { clerkUserId: user.id },
      data: { role: 'PARTNER', status: 'ACTIVE' },
    })
    .catch(() => {})

  logger.info('[PARTNER PROVISION] Existing Clerk account granted partner access', {
    orgId: org.id,
    clerkUserId: user.id,
  })
  return true
}

/**
 * Approve a PENDING partner org: activate it, send the Clerk sign-up
 * invitation to the org owner, and email the approval. If the contact email
 * already has a Clerk account (they signed up before applying), that account
 * is granted partner access directly — no invitation. Idempotent-ish: an
 * already-ACTIVE org just re-sends the invitation if the owner never linked.
 */
export async function approvePartnerOrg(
  orgId: string,
  approvedBy: string
): Promise<{ orgId: string; invited: boolean }> {
  const client = db()
  const org = await client.partnerOrg.findUnique({ where: { id: orgId } })
  if (!org) throw new PartnerProvisionError('Partner org not found', 'NOT_FOUND', 404)
  if (org.status === 'SUSPENDED') {
    throw new PartnerProvisionError('Reactivate the org before inviting.', 'SUSPENDED', 409)
  }

  if (org.status !== 'ACTIVE') {
    await client.partnerOrg.update({
      where: { id: orgId },
      data: { status: 'ACTIVE', approvedAt: new Date(), approvedBy },
    })
  }

  // Owner already has a login — nothing to invite.
  if (org.clerkUserId) return { orgId, invited: false }

  // Applicant signed up before applying (e.g. via the clinic onboarding page)?
  // Grant their existing account partner access instead of inviting.
  if (await linkExistingClerkAccount({ id: org.id, contactEmail: org.contactEmail })) {
    sendAffiliateApprovedEmail({
      to: org.contactEmail,
      contactName: org.contactName,
      orgName: org.name,
      existingAccount: true,
    }).catch(() => {})
    logger.info('[PARTNER PROVISION] Org approved + existing account linked', {
      orgId,
      approvedBy,
    })
    return { orgId, invited: false }
  }

  const inviteUrl = await createPartnerInvitation(org.contactEmail, { partnerOrgId: org.id })
  // With an inviteUrl this is the single welcome email (Clerk's generic one is
  // suppressed); without one it announces the Clerk invitation that follows.
  sendAffiliateApprovedEmail({
    to: org.contactEmail,
    contactName: org.contactName,
    orgName: org.name,
    inviteUrl,
  }).catch(() => {})

  logger.info('[PARTNER PROVISION] Org approved + owner invited', { orgId, approvedBy })
  return { orgId, invited: true }
}

/** Reject (suspend) a pending application and email the applicant. */
export async function rejectPartnerOrg(
  orgId: string,
  reason: string | undefined,
  rejectedBy: string
): Promise<void> {
  const client = db()
  const org = await client.partnerOrg.findUnique({ where: { id: orgId } })
  if (!org) throw new PartnerProvisionError('Partner org not found', 'NOT_FOUND', 404)

  await client.partnerOrg.update({
    where: { id: orgId },
    data: { status: 'SUSPENDED', approvedBy: rejectedBy },
  })
  sendAffiliateRejectedEmail({
    to: org.contactEmail,
    contactName: org.contactName,
    orgName: org.name,
    reason,
  }).catch(() => {})
  logger.info('[PARTNER PROVISION] Org rejected', { orgId, rejectedBy })
}

/**
 * Create a rep under an org and send their Clerk sign-up invitation. The rep
 * activates when they accept (webhook flips status + stamps clerkUserId).
 */
export async function invitePartnerRep(
  orgId: string,
  input: { name: string; email: string; phone?: string | null; commissionRateBps: number }
): Promise<{ repId: string }> {
  const client = db()
  const email = input.email.toLowerCase()

  const existing = await client.partnerRep.findUnique({
    where: { orgId_email: { orgId, email } },
    select: { id: true, clerkUserId: true },
  })
  if (existing?.clerkUserId) {
    throw new PartnerProvisionError('This rep already has an active login.', 'ALREADY_ACTIVE', 409)
  }

  const rep = existing
    ? await client.partnerRep.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          phone: input.phone ?? null,
          commissionRateBps: input.commissionRateBps,
          invitedAt: new Date(),
        },
      })
    : await client.partnerRep.create({
        data: {
          orgId,
          name: input.name,
          email,
          phone: input.phone ?? null,
          commissionRateBps: input.commissionRateBps,
          status: 'PENDING',
        },
      })

  const inviteUrl = await createPartnerInvitation(email, { partnerRepId: rep.id })
  if (inviteUrl) {
    const org = await client.partnerOrg.findUnique({ where: { id: orgId }, select: { name: true } })
    sendPartnerRepInviteEmail({
      to: email,
      repName: input.name,
      orgName: org?.name || 'PeptSci',
      inviteUrl,
    }).catch(() => {})
  }
  logger.info('[PARTNER PROVISION] Rep invited', { orgId, repId: rep.id })
  return { repId: rep.id }
}

/** Create an org teammate (ADMIN/VIEWER) and send their sign-up invitation. */
export async function invitePartnerMember(
  orgId: string,
  input: { name: string; email: string; role: 'ADMIN' | 'VIEWER'; invitedBy: string }
): Promise<{ memberId: string }> {
  const client = db()
  const email = input.email.toLowerCase()

  const existing = await client.partnerOrgMember.findUnique({
    where: { orgId_email: { orgId, email } },
    select: { id: true, clerkUserId: true },
  })
  if (existing?.clerkUserId) {
    throw new PartnerProvisionError(
      'This teammate already has an active login.',
      'ALREADY_ACTIVE',
      409
    )
  }

  const member = existing
    ? await client.partnerOrgMember.update({
        where: { id: existing.id },
        data: { name: input.name, role: input.role, invitedAt: new Date() },
      })
    : await client.partnerOrgMember.create({
        data: {
          orgId,
          name: input.name,
          email,
          role: input.role,
          status: 'PENDING',
          invitedBy: input.invitedBy,
        },
      })

  const inviteUrl = await createPartnerInvitation(email, { partnerMemberId: member.id })
  if (inviteUrl) {
    const org = await client.partnerOrg.findUnique({ where: { id: orgId }, select: { name: true } })
    sendPartnerTeamInviteEmail({
      to: email,
      name: input.name,
      orgName: org?.name || 'PeptSci',
      role: input.role,
      inviteUrl,
    }).catch(() => {})
  }
  logger.info('[PARTNER PROVISION] Member invited', { orgId, memberId: member.id })
  return { memberId: member.id }
}
