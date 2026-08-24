/**
 * Partner login / first-access helpers. Keep apply → review → invite →
 * sign-in → MSA on one story so clinic shop copy does not leak in.
 */

import { ACCOUNT_REVIEW_SLA, SUPPORT_EMAIL } from '@/lib/shop/portal'
import { isStaffRole } from '@/lib/access'

export const PARTNER_REVIEW_SLA = ACCOUNT_REVIEW_SLA
export const PARTNER_SUPPORT_EMAIL = SUPPORT_EMAIL
export const PARTNER_SIGN_IN_PATH = '/partners/sign-in'
export const PARTNER_APPLY_PATH = '/partners/apply'
export const PARTNER_HOME_PATH = '/partners'

export type PartnerNoAccessKind = 'clinic' | 'staff' | 'unlinked'

export type PartnerAccessLink = { href: string; label: string }

export function isSafePartnerRedirect(path: string | null | undefined): boolean {
  if (!path) return false
  return path.startsWith('/partners') && !path.startsWith('//') && !path.includes('://')
}

export function partnerPostAuthPath(input: {
  intent?: string | null
  redirectUrl?: string | null
}): string {
  if (isSafePartnerRedirect(input.redirectUrl)) return input.redirectUrl as string
  if (input.intent === 'partner') return PARTNER_HOME_PATH
  return '/'
}

export function isPartnerSignInIntent(input: {
  intent?: string | null
  redirectUrl?: string | null
}): boolean {
  if (input.intent === 'partner') return true
  return isSafePartnerRedirect(input.redirectUrl)
}

export function partnerNoAccessKind(role: string | undefined | null): PartnerNoAccessKind {
  if (role === 'PARTNER') return 'unlinked'
  if (role && isStaffRole(role)) return 'staff'
  return 'clinic'
}

export function partnerNoAccessCopy(kind: PartnerNoAccessKind): {
  title: string
  body: string
  primary: PartnerAccessLink
  secondary: PartnerAccessLink
} {
  if (kind === 'staff') {
    return {
      title: 'This login is a staff account',
      body: 'Partner commissions and referral links live in the partner portal. Sign out, then use the partner invitation email — or manage partners from the admin console.',
      primary: { href: PARTNER_SIGN_IN_PATH, label: 'Sign out' },
      secondary: { href: '/dashboard', label: 'Open admin' },
    }
  }
  if (kind === 'unlinked') {
    return {
      title: 'Partner access is not linked yet',
      body: 'This login is marked as a partner, but it is not connected to an organization. Accept the invitation email from PeptSci first. If you already applied, wait for approval — we usually reply within ' +
        PARTNER_REVIEW_SLA +
        '.',
      primary: { href: PARTNER_SIGN_IN_PATH, label: 'Sign out' },
      secondary: { href: PARTNER_APPLY_PATH, label: 'Apply to the program' },
    }
  }
  return {
    title: 'This login is a clinic account',
    body: 'The partner portal is for sales organizations and reps, not practice ordering. Sign out, then use the invitation from PeptSci — or apply to the partner program.',
    primary: { href: PARTNER_SIGN_IN_PATH, label: 'Sign out' },
    secondary: { href: PARTNER_APPLY_PATH, label: 'Apply to the program' },
  }
}

export function partnerPendingCopy(): {
  title: string
  nextStep: string
  bullets: string[]
  expedite: string
  supportEmail: string
} {
  return {
    title: 'Partner application under review',
    nextStep: 'Access to your partner portal',
    bullets: [
      `Our team reviews partner applications within ${PARTNER_REVIEW_SLA}`,
      'You will receive an email with a portal invitation once approved',
      'After you accept the invite you can create links and track commissions',
    ],
    expedite: 'Include your organization name and application number for the fastest reply.',
    supportEmail: PARTNER_SUPPORT_EMAIL,
  }
}
