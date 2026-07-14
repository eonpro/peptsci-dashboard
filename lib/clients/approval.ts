/**
 * Canonical onboarding-decision cascade for a practice (Client).
 *
 * Every approval path (admin client detail PATCH, admin users approve) MUST go
 * through `cascadeOnboardingDecision` so the practice record, its linked auth
 * users (Postgres + Clerk metadata), and the decision emails can never drift
 * apart — regardless of which admin screen the decision was made from.
 */

import { clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  sendPartnerApprovedEmail,
  sendPartnerRejectedEmail,
  sendPartnerNeedsInfoEmail,
} from '@/lib/email'

export type OnboardingDecision = 'APPROVED' | 'REJECTED' | 'NEEDS_INFO'

export interface CascadeResult {
  clientId: string
  decision: OnboardingDecision
  /** Whether the client's onboardingStatus actually changed. */
  changed: boolean
  /** New user status applied to linked users. */
  userStatus: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | null
  /** Emails the decision notice was sent to ([] when skipped as unchanged). */
  emailedTo: string[]
}

function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_'))
}

/**
 * Apply an onboarding decision to a practice and cascade it everywhere:
 *  1. `Client.onboardingStatus` ← decision
 *  2. Linked `User.status` ← ACTIVE (approved) / SUSPENDED (rejected)
 *  3. Clerk publicMetadata for each linked user (role/status/clientId)
 *  4. Decision email to the practice contact + linked user emails
 *
 * Emails are only sent when the status actually changed (re-saving an already
 * APPROVED client does not re-send approval emails). Email/Clerk failures are
 * logged, never thrown.
 */
export async function cascadeOnboardingDecision(opts: {
  clientId: string
  decision: OnboardingDecision
  reason?: string
  message?: string
  actorId?: string
}): Promise<CascadeResult | null> {
  if (!prisma) return null
  const { clientId, decision } = opts

  const before = await prisma.client.findUnique({
    where: { id: clientId },
    select: { onboardingStatus: true },
  })
  if (!before) return null
  const changed = before.onboardingStatus !== decision

  const client = await prisma.client.update({
    where: { id: clientId },
    data: { onboardingStatus: decision },
    select: {
      id: true,
      contactEmail: true,
      contactName: true,
      organizationName: true,
      users: { select: { id: true, clerkUserId: true, email: true, role: true } },
    },
  })

  // ── Cascade to linked auth users (DB + Clerk) ──
  // NEEDS_INFO pulls users back to PENDING: a practice flagged for missing
  // compliance info must not keep ordering on a previously-approved login.
  const userStatus =
    decision === 'APPROVED' ? 'ACTIVE' : decision === 'REJECTED' ? 'SUSPENDED' : 'PENDING'
  if (userStatus) {
    await prisma.user.updateMany({ where: { clientId }, data: { status: userStatus } })

    if (isClerkConfigured() && client.users.length > 0) {
      const clerk = await clerkClient()
      await Promise.all(
        client.users.map(async (u) => {
          try {
            await clerk.users.updateUserMetadata(u.clerkUserId, {
              publicMetadata: { role: u.role ?? 'CLIENT', status: userStatus, clientId },
            })
          } catch (e) {
            logger.error(
              '[APPROVAL] Failed to sync user status to Clerk',
              { userId: u.id, clientId },
              e instanceof Error ? e : new Error(String(e))
            )
          }
        })
      )
    }
  }

  // ── Decision email (only when the status actually changed) ──
  let emailedTo: string[] = []
  if (changed) {
    const recipients = Array.from(
      new Set(
        [client.contactEmail, ...client.users.map((u) => u.email)].filter((e): e is string =>
          Boolean(e)
        )
      )
    )
    const name = client.contactName || client.organizationName
    if (recipients.length > 0) {
      if (decision === 'APPROVED') {
        await sendPartnerApprovedEmail({ to: recipients, name })
      } else if (decision === 'REJECTED') {
        await sendPartnerRejectedEmail({ to: recipients, name, reason: opts.reason })
      } else {
        await sendPartnerNeedsInfoEmail({ to: recipients, name, message: opts.message })
      }
      emailedTo = recipients
    }
  }

  logger.info('[APPROVAL] Onboarding decision cascaded', {
    clientId,
    decision,
    changed,
    userStatus,
    emailed: emailedTo.length,
    by: opts.actorId,
  })

  return { clientId, decision, changed, userStatus, emailedTo }
}
