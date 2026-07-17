/**
 * Partner-portal access control (ported from eonpro/logosrx-website
 * `src/lib/auth/partner.ts`).
 *
 * A signed-in Clerk user maps to exactly one partner identity via DB lookup
 * on `clerkUserId` (mirroring how shop actors resolve through User.clientId):
 *   - an ORG OWNER  (PartnerOrg.clerkUserId)     — full org visibility
 *   - an ORG MEMBER (PartnerOrgMember.clerkUserId) — ADMIN or VIEWER teammate
 *   - a REP         (PartnerRep.clerkUserId)     — sees only their own book
 *
 * Suspended identities have no access. A rep/member also loses access when
 * their parent org is suspended. The `PARTNER` Clerk metadata role only
 * routes middleware; THIS lookup is the authority for data access.
 */

import { auth } from '@clerk/nextjs/server'
import type { PartnerOrg, PartnerRep, PartnerOrgMember } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type PartnerKind = 'ORG' | 'REP'
export type PartnerRole = 'OWNER' | 'ADMIN' | 'VIEWER'

const ROLE_RANK: Record<PartnerRole, number> = { VIEWER: 0, ADMIN: 1, OWNER: 2 }

export function roleAtLeast(role: PartnerRole | null, min: PartnerRole): boolean {
  if (!role) return false
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

export interface PartnerContext {
  userId: string
  kind: PartnerKind
  org: PartnerOrg
  /** Set only for rep sessions. */
  rep: PartnerRep | null
  /** Set only for invited-member sessions. */
  member: PartnerOrgMember | null
  /** Org role for `kind: 'ORG'` (OWNER | ADMIN | VIEWER); null for reps. */
  role: PartnerRole | null
}

export class PartnerForbiddenError extends Error {
  readonly status = 403
  constructor() {
    super('forbidden')
    this.name = 'PartnerForbiddenError'
  }
}

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

/**
 * Resolves the current request to a partner identity, or `null` when the
 * caller is anonymous, not a partner, or suspended. Safe for server
 * components (read-only).
 */
export async function getPartnerContext(): Promise<PartnerContext | null> {
  if (!prisma || !isClerkConfigured) return null
  const { userId } = await auth()
  if (!userId) return null

  // 1. Org owner (the account that was approved).
  const org = await prisma.partnerOrg.findUnique({ where: { clerkUserId: userId } })
  if (org) {
    if (org.status !== 'ACTIVE') return null
    return { userId, kind: 'ORG', org, rep: null, member: null, role: 'OWNER' }
  }

  // 2. Invited org member (ADMIN/VIEWER teammate).
  const member = await prisma.partnerOrgMember.findUnique({
    where: { clerkUserId: userId },
    include: { org: true },
  })
  if (member) {
    if (member.status !== 'ACTIVE' || member.org.status !== 'ACTIVE') return null
    return {
      userId,
      kind: 'ORG',
      org: member.org,
      rep: null,
      member,
      role: member.role === 'ADMIN' ? 'ADMIN' : 'VIEWER',
    }
  }

  // 3. Rep.
  const rep = await prisma.partnerRep.findUnique({
    where: { clerkUserId: userId },
    include: { org: true },
  })
  if (!rep) return null
  if (rep.status !== 'ACTIVE' || rep.org.status !== 'ACTIVE') return null

  return { userId, kind: 'REP', org: rep.org, rep, member: null, role: null }
}

/**
 * Strict variant for API routes and mutations. Throws when the caller is not
 * an active partner.
 *
 *   - `orgOnly` rejects rep sessions (org-level features like rep/goal mgmt).
 *   - `minRole` requires at least that org role. It only constrains org users;
 *     reps (their own scoped data) are unaffected. So a management mutation
 *     should use `{ minRole: 'ADMIN' }` to block org VIEWERs while still
 *     letting reps manage their own resources.
 */
export async function requirePartner(
  options: { orgOnly?: boolean; minRole?: PartnerRole } = {}
): Promise<PartnerContext> {
  const ctx = await getPartnerContext()
  if (!ctx) throw new PartnerForbiddenError()
  if (options.orgOnly && ctx.kind !== 'ORG') throw new PartnerForbiddenError()
  if (options.minRole && ctx.kind === 'ORG' && !roleAtLeast(ctx.role, options.minRole)) {
    throw new PartnerForbiddenError()
  }
  return ctx
}
