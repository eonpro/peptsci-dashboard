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
import { sendAffiliateApprovedEmail, sendAffiliateRejectedEmail } from '@/lib/email'

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

/** Clerk invitation seeded with PARTNER role + the identity row to link. */
async function createPartnerInvitation(
  email: string,
  identity: { partnerOrgId?: string; partnerRepId?: string; partnerMemberId?: string }
): Promise<void> {
  if (!isClerkConfigured) {
    logger.warn('[PARTNER PROVISION] Clerk not configured — skipping invitation', { email })
    return
  }
  const clerk = await clerkClient()
  try {
    await clerk.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role: 'PARTNER', status: 'ACTIVE', ...identity },
      redirectUrl: `${APP_URL}/sign-up`,
      ignoreExisting: false,
    })
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
 * Approve a PENDING partner org: activate it, send the Clerk sign-up
 * invitation to the org owner, and email the approval. Idempotent-ish: an
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

  await createPartnerInvitation(org.contactEmail, { partnerOrgId: org.id })
  sendAffiliateApprovedEmail({
    to: org.contactEmail,
    contactName: org.contactName,
    orgName: org.name,
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

  await createPartnerInvitation(email, { partnerRepId: rep.id })
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

  await createPartnerInvitation(email, { partnerMemberId: member.id })
  logger.info('[PARTNER PROVISION] Member invited', { orgId, memberId: member.id })
  return { memberId: member.id }
}
