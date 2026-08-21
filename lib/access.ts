/**
 * Pure, dependency-free access-control + pricing helpers.
 *
 * Kept free of Clerk/Prisma imports so the logic is unit-testable and shared
 * between server guards (lib/auth.ts), middleware, and client hooks.
 */

export type UserRole =
  | 'CLIENT'
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'PARTNER'
  | 'FULFILLMENT'
  | 'BILLING'
  | 'CATALOG'
  | 'FINANCE_VIEWER'

export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

/** Staff presets that enter the admin console (not CLIENT / PARTNER). */
export const STAFF_ROLES: readonly UserRole[] = [
  'ADMIN',
  'SUPER_ADMIN',
  'FULFILLMENT',
  'BILLING',
  'CATALOG',
  'FINANCE_VIEWER',
] as const

const STAFF_ROLE_SET = new Set<string>(STAFF_ROLES)

export function isStaffRole(role: string | undefined | null): boolean {
  return !!role && STAFF_ROLE_SET.has(role)
}

/** @deprecated Prefer isStaffRole — kept as alias for existing call sites. */
export function isAdminRole(role: string | undefined | null): boolean {
  return isStaffRole(role)
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
 * Staff presets that lack dashboard:read are refined later via
 * staffHomeForPermissions once grant/deny are known.
 */
export function defaultRouteForRole(role: string | undefined | null): string {
  if (isStaffRole(role)) {
    switch (role) {
      case 'FULFILLMENT':
        return '/fulfillment'
      case 'FINANCE_VIEWER':
        return '/profit-loss'
      case 'BILLING':
        return '/invoices'
      case 'CATALOG':
        return '/products'
      default:
        return '/dashboard'
    }
  }
  if (isPartnerRole(role)) return '/partners'
  return '/shop'
}

/**
 * Resolve the effective unit price for a client.
 *
 * Precedence:
 *   1. At-cost pricing — when the clinic is flagged `paysAtCost`, they pay
 *      exactly what we pay per vial (`unitCost`), overriding everything.
 *      A vial with no cost set (unitCost <= 0) falls through so we never
 *      sell at $0.
 *   2. A positive per-SKU custom price (ClientPricing).
 *   3. SRP.
 */
export function resolveEffectiveUnitPrice(input: {
  srp: number
  customPrice?: number | null
  /** Our per-vial cost (ProductVariant.unitCost) — required for at-cost clinics. */
  unitCost?: number | null
  /** Clinic-level "pays what we pay" flag (Client.paysAtCost). */
  paysAtCost?: boolean
}): { price: number; isCustom: boolean; isAtCost: boolean } {
  const { srp, customPrice, unitCost, paysAtCost } = input
  if (paysAtCost && typeof unitCost === 'number' && unitCost > 0) {
    return { price: unitCost, isCustom: true, isAtCost: true }
  }
  if (typeof customPrice === 'number' && customPrice > 0) {
    return { price: customPrice, isCustom: true, isAtCost: false }
  }
  return { price: srp, isCustom: false, isAtCost: false }
}
