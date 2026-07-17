/**
 * Pure, dependency-free access-control + pricing helpers.
 *
 * Kept free of Clerk/Prisma imports so the logic is unit-testable and shared
 * between server guards (lib/auth.ts), middleware, and client hooks.
 */

export type UserRole = 'CLIENT' | 'ADMIN' | 'SUPER_ADMIN' | 'PARTNER'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

export function isAdminRole(role: string | undefined | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

export function isSuperAdminRole(role: string | undefined | null): boolean {
  return role === 'SUPER_ADMIN'
}

/** Affiliate sales-org account (partner portal user, not a clinic). */
export function isPartnerRole(role: string | undefined | null): boolean {
  return role === 'PARTNER'
}

export function isActiveStatus(status: string | undefined | null): boolean {
  return status === 'ACTIVE'
}

/**
 * Where a user should land after auth, based on role.
 */
export function defaultRouteForRole(role: string | undefined | null): string {
  if (isAdminRole(role)) return '/dashboard'
  if (isPartnerRole(role)) return '/partners'
  return '/shop'
}

/**
 * Resolve the effective unit price for a client.
 * A positive custom price overrides SRP; otherwise SRP applies.
 */
export function resolveEffectiveUnitPrice(input: {
  srp: number
  customPrice?: number | null
}): { price: number; isCustom: boolean } {
  const { srp, customPrice } = input
  if (typeof customPrice === 'number' && customPrice > 0) {
    return { price: customPrice, isCustom: true }
  }
  return { price: srp, isCustom: false }
}
