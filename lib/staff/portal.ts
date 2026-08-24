/**
 * Staff admin information architecture — five primary destinations so 21 nav
 * leaves stop competing. Catalog hub is /merch because /catalog is the public
 * lookbook.
 */

import { hasAnyPermission, hasPermission, type Permission } from '@/lib/permissions'
import { NAV_LINK_PERMISSIONS } from '@/lib/admin-route-permissions'
import { staffHasWritePermission } from '@/lib/staff/access'

export type StaffPortalLink = {
  name: string
  href: string
  description: string
}

export type StaffPrimaryNavItem = {
  name: 'Home' | 'Fulfill' | 'Catalog' | 'Money' | 'Admin'
  href: string
  exact?: boolean
}

export type StaffMobileNavItem = {
  name: 'Home' | 'Fulfillment' | 'Catalog' | 'Admin'
  href: string
  exact?: boolean
}

export const STAFF_PRIMARY_NAV: readonly StaffPrimaryNavItem[] = [
  { name: 'Home', href: '/dashboard', exact: true },
  { name: 'Fulfill', href: '/fulfillment' },
  { name: 'Catalog', href: '/merch' },
  { name: 'Money', href: '/money' },
  { name: 'Admin', href: '/manage' },
]

export const STAFF_MOBILE_NAV: readonly StaffMobileNavItem[] = [
  { name: 'Home', href: '/dashboard', exact: true },
  { name: 'Fulfillment', href: '/fulfillment' },
  { name: 'Catalog', href: '/merch' },
  { name: 'Admin', href: '/manage' },
]

export const STAFF_CATALOG_LINKS: readonly StaffPortalLink[] = [
  {
    name: 'Products',
    href: '/products',
    description: 'SKUs, COAs, and the sellable catalog',
  },
  {
    name: 'Inventory',
    href: '/inventory',
    description: 'On-hand, batches, and receive stock',
  },
  {
    name: 'Pricing',
    href: '/pricing',
    description: 'Cost and suggested retail',
  },
  {
    name: 'Clinic pricing',
    href: '/pricing/client-pricing',
    description: 'Per-practice catalog prices',
  },
  {
    name: 'PO generator',
    href: '/po-generator',
    description: 'Purchase order PDFs',
  },
]

export const STAFF_MONEY_LINKS: readonly StaffPortalLink[] = [
  {
    name: 'Customers',
    href: '/customers',
    description: 'Revenue rollup by buyer',
  },
  {
    name: 'Invoices',
    href: '/invoices',
    description: 'Billing, charges, and aging',
  },
  {
    name: 'Returns',
    href: '/returns',
    description: 'RMAs, inspection, restock',
  },
  {
    name: 'Orders & expenses',
    href: '/orders-expenses',
    description: 'Distributor orders and spend',
  },
  {
    name: 'P&L',
    href: '/profit-loss',
    description: 'Profit and loss',
  },
  {
    name: 'Reports',
    href: '/reports',
    description: 'Analytics and CSV exports',
  },
  {
    name: 'Competitors',
    href: '/competitors',
    description: 'Market price tracking',
  },
]

export const STAFF_ADMIN_LINKS: readonly StaffPortalLink[] = [
  {
    name: 'Clinics',
    href: '/clients',
    description: 'Practice accounts and approvals',
  },
  {
    name: 'Users',
    href: '/users',
    description: 'Staff logins, roles, invitations',
  },
  {
    name: 'Partners',
    href: '/partners-admin',
    description: 'Sales orgs and commissions',
  },
  {
    name: 'Storefronts',
    href: '/storefronts',
    description: 'White-label clinic stores',
  },
  {
    name: 'Resources',
    href: '/resources',
    description: 'Client education articles',
  },
  {
    name: 'Package photos',
    href: '/package-photos',
    description: 'Contents photos by order',
  },
  {
    name: 'Support',
    href: '/support',
    description: 'Clinic support tickets',
  },
  {
    name: 'Stripe',
    href: '/settings/stripe',
    description: 'Payments configuration',
  },
  {
    name: 'Webhooks',
    href: '/settings/webhooks',
    description: 'Inbound event log',
  },
]

export type StaffSection = 'catalog' | 'money' | 'admin'

const CATALOG_PREFIXES = ['/merch', '/products', '/inventory', '/pricing', '/po-generator']
const MONEY_PREFIXES = [
  '/money',
  '/customers',
  '/invoices',
  '/returns',
  '/orders-expenses',
  '/profit-loss',
  '/reports',
  '/competitors',
]
const ADMIN_PREFIXES = [
  '/manage',
  '/clients',
  '/users',
  '/partners-admin',
  '/storefronts',
  '/resources',
  '/package-photos',
  '/support',
  '/settings',
]

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function staffSectionForPath(pathname: string): StaffSection | null {
  if (matchesPrefix(pathname, CATALOG_PREFIXES)) return 'catalog'
  if (matchesPrefix(pathname, MONEY_PREFIXES)) return 'money'
  if (matchesPrefix(pathname, ADMIN_PREFIXES)) return 'admin'
  return null
}

export function isStaffPrimaryActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact || href === '/dashboard') return pathname === '/dashboard'
  if (href === '/merch') return staffSectionForPath(pathname) === 'catalog'
  if (href === '/money') return staffSectionForPath(pathname) === 'money'
  if (href === '/manage') return staffSectionForPath(pathname) === 'admin'
  if (href === '/fulfillment') {
    return pathname === '/fulfillment' || pathname.startsWith('/fulfillment/')
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isStaffMobileActive(href: string, pathname: string, exact?: boolean): boolean {
  if (exact || href === '/dashboard') return pathname === '/dashboard'
  if (href === '/fulfillment') {
    return pathname === '/fulfillment' || pathname.startsWith('/fulfillment/')
  }
  if (href === '/merch') return staffSectionForPath(pathname) === 'catalog'
  if (href === '/manage') return staffSectionForPath(pathname) === 'admin'
  return pathname === href || pathname.startsWith(`${href}/`)
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Home',
  '/fulfillment': 'Fulfillment',
  '/merch': 'Catalog',
  '/products': 'Products',
  '/inventory': 'Inventory',
  '/pricing': 'Pricing',
  '/pricing/client-pricing': 'Clinic pricing',
  '/po-generator': 'PO generator',
  '/money': 'Money',
  '/customers': 'Customers',
  '/invoices': 'Invoices',
  '/returns': 'Returns',
  '/orders-expenses': 'Orders & expenses',
  '/profit-loss': 'P&L',
  '/reports': 'Reports',
  '/competitors': 'Competitors',
  '/manage': 'Admin',
  '/clients': 'Clinics',
  '/users': 'Users',
  '/partners-admin': 'Partners',
  '/storefronts': 'Storefronts',
  '/resources': 'Resources',
  '/package-photos': 'Package photos',
  '/support': 'Support',
}

export function staffPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const keys = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (pathname.startsWith(`${key}/`)) return PAGE_TITLES[key]
  }
  return 'Admin'
}

export type StaffMutateDomain =
  | 'fulfillment'
  | 'catalog'
  | 'billing'
  | 'clients'
  | 'users'
  | 'partners'
  | 'sales'
  | 'storefronts'
  | 'settings'

export function staffCanMutate(
  permissions: readonly Permission[],
  domain?: StaffMutateDomain
): boolean {
  if (domain) return staffHasWritePermission(permissions, domain)
  return (
    permissions.some((p) => p.endsWith(':write')) ||
    hasPermission(permissions, 'users:roles') ||
    hasPermission(permissions, 'system:migrate')
  )
}

function canSeeHref(href: string, permissions: readonly Permission[]): boolean {
  const need = NAV_LINK_PERMISSIONS[href]
  if (!need) return true
  const list = Array.isArray(need) ? need : [need]
  return hasAnyPermission(permissions, list)
}

export function visibleStaffLinks(
  links: readonly StaffPortalLink[],
  permissions: readonly Permission[]
): StaffPortalLink[] {
  return links.filter((l) => canSeeHref(l.href, permissions))
}

export function visiblePrimaryNav(permissions: readonly Permission[]): StaffPrimaryNavItem[] {
  return STAFF_PRIMARY_NAV.filter((item) => canSeeHref(item.href, permissions))
}

export function visibleMobileNav(permissions: readonly Permission[]): StaffMobileNavItem[] {
  return STAFF_MOBILE_NAV.filter((item) => canSeeHref(item.href, permissions))
}

export function sectionLinks(section: StaffSection): readonly StaffPortalLink[] {
  if (section === 'catalog') return STAFF_CATALOG_LINKS
  if (section === 'money') return STAFF_MONEY_LINKS
  return STAFF_ADMIN_LINKS
}

export function staffHubOverviewHref(section: StaffSection): string {
  if (section === 'catalog') return '/merch'
  if (section === 'money') return '/money'
  return '/manage'
}
