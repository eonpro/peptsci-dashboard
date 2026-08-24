/**
 * Partner role ranks — kept free of Clerk / server-only so client chrome
 * (portal.ts, PartnerPortalProvider) can share them with the server auth module.
 */

export type PartnerKind = 'ORG' | 'REP'
export type PartnerRole = 'OWNER' | 'ADMIN' | 'VIEWER'

const ROLE_RANK: Record<PartnerRole, number> = { VIEWER: 0, ADMIN: 1, OWNER: 2 }

export function roleAtLeast(role: PartnerRole | null, min: PartnerRole): boolean {
  if (!role) return false
  return ROLE_RANK[role] >= ROLE_RANK[min]
}
