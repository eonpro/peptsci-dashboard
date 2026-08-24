/**
 * Partner portal information architecture — four primary destinations so
 * Grow / Earnings / Account stop competing as 11–14 sidebar items.
 */

import { roleAtLeast, type PartnerKind, type PartnerRole } from '@/lib/partners/roles'

export type PartnerPortalLink = {
  name: string
  href: string
  description: string
}

export type PartnerPrimaryNavItem = {
  name: 'Home' | 'Grow' | 'Earnings' | 'Account'
  href: string
  exact?: boolean
}

export type PartnerMobileNavItem = {
  name: 'Home' | 'Links' | 'Earnings' | 'Account'
  href: string
  exact?: boolean
}

export type PartnerNavContext = {
  kind: PartnerKind
  role: PartnerRole | null
  marginModel: boolean
}

/** Desktop primary nav. Nested tools live on hub pages. */
export const PARTNER_PRIMARY_NAV: readonly PartnerPrimaryNavItem[] = [
  { name: 'Home', href: '/partners', exact: true },
  { name: 'Grow', href: '/partners/grow' },
  { name: 'Earnings', href: '/partners/earnings' },
  { name: 'Account', href: '/partners/account' },
]

/** Phone bar: Links is the daily job, not a fifth Grow item. */
export const PARTNER_MOBILE_NAV: readonly PartnerMobileNavItem[] = [
  { name: 'Home', href: '/partners', exact: true },
  { name: 'Links', href: '/partners/links' },
  { name: 'Earnings', href: '/partners/earnings' },
  { name: 'Account', href: '/partners/account' },
]

/** Grow hub — referral links first. "Prospects" avoids colliding with clinic stage LEAD. */
export const PARTNER_GROW_LINKS: readonly PartnerPortalLink[] = [
  {
    name: 'Referral links',
    href: '/partners/links',
    description: 'Create a trackable URL, copy it, and see clicks and signups',
  },
  {
    name: 'Clinics',
    href: '/partners/clinics',
    description: 'Every practice attributed to your book',
  },
  {
    name: 'Prospects',
    href: '/partners/leads',
    description: 'Lock attribution before they click a link',
  },
  {
    name: 'Quotes',
    href: '/partners/quotes',
    description: 'Printable prices for a clinic you are courting',
  },
  {
    name: 'Goals',
    href: '/partners/goals',
    description: 'Revenue or commission targets',
  },
]

/** Earnings hub — one place for earned / unpaid / paid. */
export const PARTNER_EARNINGS_LINKS: readonly PartnerPortalLink[] = [
  {
    name: 'Activity',
    href: '/partners/transactions',
    description: 'Each attributed order and the commission on it',
  },
  {
    name: 'Statements',
    href: '/partners/statements',
    description: 'Month-by-month books that should match ours',
  },
  {
    name: 'Payouts',
    href: '/partners/payouts',
    description: 'Unpaid balance, W-9, and request a transfer',
  },
]

/** Account hub — sellers vs portal logins are different jobs. */
export const PARTNER_ACCOUNT_LINKS: readonly PartnerPortalLink[] = [
  {
    name: 'Sellers',
    href: '/partners/reps',
    description: 'Commissioned reps who sell; they apply, you approve',
  },
  {
    name: 'Portal access',
    href: '/partners/team',
    description: 'Admins and viewers who log into this portal',
  },
  {
    name: 'Marketing kit',
    href: '/partners/assets',
    description: 'Banners, one-pagers, and copy to pair with your links',
  },
  {
    name: 'Clinic pricing',
    href: '/partners/pricing',
    description: 'Sell prices above your wholesale floor',
  },
  {
    name: 'Program terms',
    href: '/partners/terms',
    description: 'Rates, holds, W-9, and payout policy',
  },
]

export type PartnerSection = 'grow' | 'earnings' | 'account'

const GROW_PREFIXES = ['/partners/grow', '/partners/links', '/partners/clinics', '/partners/leads', '/partners/quotes', '/partners/goals']
const EARNINGS_PREFIXES = ['/partners/earnings', '/partners/transactions', '/partners/statements', '/partners/payouts']
const ACCOUNT_PREFIXES = ['/partners/account', '/partners/reps', '/partners/team', '/partners/assets', '/partners/pricing', '/partners/terms']

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function partnerSectionForPath(pathname: string): PartnerSection | null {
  if (matchesPrefix(pathname, GROW_PREFIXES)) return 'grow'
  if (matchesPrefix(pathname, EARNINGS_PREFIXES)) return 'earnings'
  if (matchesPrefix(pathname, ACCOUNT_PREFIXES)) return 'account'
  return null
}

export function isPartnerPrimaryActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact || href === '/partners') return pathname === '/partners'
  if (href === '/partners/grow') return partnerSectionForPath(pathname) === 'grow'
  if (href === '/partners/earnings') return partnerSectionForPath(pathname) === 'earnings'
  if (href === '/partners/account') return partnerSectionForPath(pathname) === 'account'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isPartnerMobileActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact || href === '/partners') return pathname === '/partners'
  if (href === '/partners/links') {
    return pathname === '/partners/links' || pathname.startsWith('/partners/links/')
  }
  if (href === '/partners/earnings') return partnerSectionForPath(pathname) === 'earnings'
  if (href === '/partners/account') return partnerSectionForPath(pathname) === 'account'
  return pathname === href || pathname.startsWith(`${href}/`)
}

const PAGE_TITLES: Record<string, string> = {
  '/partners': 'Home',
  '/partners/grow': 'Grow',
  '/partners/links': 'Referral links',
  '/partners/clinics': 'Clinics',
  '/partners/leads': 'Prospects',
  '/partners/quotes': 'Quotes',
  '/partners/goals': 'Goals',
  '/partners/earnings': 'Earnings',
  '/partners/transactions': 'Activity',
  '/partners/statements': 'Statements',
  '/partners/payouts': 'Payouts',
  '/partners/account': 'Account',
  '/partners/reps': 'Sellers',
  '/partners/team': 'Portal access',
  '/partners/assets': 'Marketing kit',
  '/partners/pricing': 'Clinic pricing',
  '/partners/terms': 'Program terms',
}

export function partnerPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const keys = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (pathname.startsWith(`${key}/`)) return PAGE_TITLES[key]
  }
  return 'Partners'
}

export function visibleAccountLinks(ctx: PartnerNavContext): PartnerPortalLink[] {
  return PARTNER_ACCOUNT_LINKS.filter((item) => {
    if (item.href === '/partners/reps' && ctx.kind !== 'ORG') return false
    if (item.href === '/partners/team' && (ctx.kind !== 'ORG' || ctx.role === 'VIEWER')) return false
    if (item.href === '/partners/pricing' && (ctx.kind !== 'ORG' || !ctx.marginModel)) return false
    return true
  })
}

export function sectionLinks(section: PartnerSection, ctx: PartnerNavContext): readonly PartnerPortalLink[] {
  if (section === 'grow') return PARTNER_GROW_LINKS
  if (section === 'earnings') return PARTNER_EARNINGS_LINKS
  return visibleAccountLinks(ctx)
}

/** Org viewers are read-only. Owners, admins, and reps can mutate their book. */
export function partnerCanMutate(kind: PartnerKind, role: PartnerRole | null): boolean {
  if (kind === 'REP') return true
  return roleAtLeast(role, 'ADMIN')
}
