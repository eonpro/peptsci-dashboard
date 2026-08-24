/**
 * Staff login / first-access helpers. Dedicated /staff/sign-in so clinic and
 * partner sessions see a wrong-account screen instead of a silent bounce.
 */

import { SUPPORT_EMAIL } from '@/lib/shop/portal'
import { isStaffRole } from '@/lib/access'
import { hasPermission, type Permission } from '@/lib/permissions'

export const STAFF_SUPPORT_EMAIL = SUPPORT_EMAIL
export const STAFF_SIGN_IN_PATH = '/staff/sign-in'
export const STAFF_HOME_PATH = '/dashboard'
export const STAFF_WRONG_ACCOUNT_PATH = '/staff/wrong-account'

export type StaffNoAccessKind = 'clinic' | 'partner' | 'unlinked'

export type StaffAccessLink = { href: string; label: string }

const ADMIN_PREFIXES = [
  '/dashboard',
  '/fulfillment',
  '/print',
  '/merch',
  '/money',
  '/manage',
  '/clients',
  '/customers',
  '/products',
  '/inventory',
  '/pricing',
  '/competitors',
  '/orders-expenses',
  '/returns',
  '/invoices',
  '/reports',
  '/profit-loss',
  '/po-generator',
  '/storefronts',
  '/users',
  '/resources',
  '/partners-admin',
  '/support',
  '/package-photos',
  '/settings',
] as const

export function isSafeStaffRedirect(path: string | null | undefined): boolean {
  if (!path || path.startsWith('//') || path.includes('://')) return false
  return ADMIN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

export function staffPostAuthPath(input: {
  intent?: string | null
  redirectUrl?: string | null
}): string {
  if (isSafeStaffRedirect(input.redirectUrl)) return input.redirectUrl as string
  if (input.intent === 'staff') return STAFF_HOME_PATH
  return STAFF_HOME_PATH
}

export function isStaffSignInIntent(input: {
  intent?: string | null
  redirectUrl?: string | null
}): boolean {
  if (input.intent === 'staff') return true
  return isSafeStaffRedirect(input.redirectUrl)
}

export function staffNoAccessKind(role: string | undefined | null): StaffNoAccessKind {
  if (role === 'PARTNER') return 'partner'
  if (role && isStaffRole(role)) return 'unlinked'
  return 'clinic'
}

export function staffNoAccessCopy(kind: StaffNoAccessKind): {
  title: string
  body: string
  primary: StaffAccessLink
  secondary: StaffAccessLink
} {
  if (kind === 'partner') {
    return {
      title: 'This login is a partner account',
      body: 'The admin console is for PeptSci staff. Sign out, then use the partner portal for commissions and referral links.',
      primary: { href: STAFF_SIGN_IN_PATH, label: 'Sign out' },
      secondary: { href: '/partners', label: 'Open partner portal' },
    }
  }
  if (kind === 'unlinked') {
    return {
      title: 'Staff access is not ready yet',
      body: `This login is marked as staff, but it cannot open the console yet. Ask an admin to finish setup, or email ${STAFF_SUPPORT_EMAIL}.`,
      primary: { href: STAFF_SIGN_IN_PATH, label: 'Sign out' },
      secondary: { href: `mailto:${STAFF_SUPPORT_EMAIL}`, label: 'Email support' },
    }
  }
  return {
    title: 'This login is a clinic account',
    body: 'The admin console is for PeptSci staff, not practice ordering. Sign out, then use the clinic shop — or ask your admin to invite you as staff.',
    primary: { href: STAFF_SIGN_IN_PATH, label: 'Sign out' },
    secondary: { href: '/shop', label: 'Open clinic shop' },
  }
}

/** Writers of money, PII, or warehouse actions must enroll 2FA. Viewers do not. */
export function staffNeedsTwoFactor(permissions: readonly Permission[]): boolean {
  return permissions.some(
    (p) =>
      p.endsWith(':write') || p === 'users:roles' || p === 'system:migrate'
  )
}

export function staffHasWritePermission(
  permissions: readonly Permission[],
  domain: string
): boolean {
  const write = `${domain}:write` as Permission
  if (hasPermission(permissions, write)) return true
  if (domain === 'users') return hasPermission(permissions, 'users:roles')
  return false
}
