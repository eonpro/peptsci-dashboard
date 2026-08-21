/**
 * Map admin UI paths + admin APIs to required staff permissions.
 *
 * Used by middleware (session-claims gate) and tests. Longest-prefix wins.
 */

import type { Permission } from './permissions'
import { hasAllPermissions, hasAnyPermission } from './permissions'

export type RoutePermissionRequirement =
  | { anyOf: Permission[] }
  | { allOf: Permission[] }
  /** Any authenticated staff role may access (notifications, etc.). */
  | { staff: true }

interface RouteRule {
  /** Path prefix (no trailing slash except root). */
  prefix: string
  requirement: RoutePermissionRequirement
}

/**
 * Ordered most-specific-first where prefixes nest (e.g. client-pricing before pricing).
 * Checked in array order; first matching prefix wins.
 */
const PAGE_RULES: RouteRule[] = [
  { prefix: '/pricing/client-pricing', requirement: { anyOf: ['catalog:read'] } },
  { prefix: '/settings/webhooks', requirement: { anyOf: ['settings:write'] } },
  { prefix: '/settings/stripe', requirement: { anyOf: ['settings:write'] } },
  { prefix: '/settings', requirement: { anyOf: ['settings:write'] } },
  { prefix: '/partners-admin', requirement: { anyOf: ['partners:read'] } },
  { prefix: '/package-photos', requirement: { anyOf: ['fulfillment:read'] } },
  { prefix: '/orders-expenses', requirement: { anyOf: ['sales:read'] } },
  { prefix: '/profit-loss', requirement: { anyOf: ['finance:read'] } },
  { prefix: '/po-generator', requirement: { anyOf: ['catalog:read'] } },
  { prefix: '/competitors', requirement: { anyOf: ['sales:read'] } },
  { prefix: '/fulfillment', requirement: { anyOf: ['fulfillment:read'] } },
  { prefix: '/storefronts', requirement: { anyOf: ['storefronts:read'] } },
  { prefix: '/customers', requirement: { anyOf: ['sales:read'] } },
  { prefix: '/inventory', requirement: { anyOf: ['catalog:read'] } },
  { prefix: '/resources', requirement: { anyOf: ['resources:write'] } },
  { prefix: '/dashboard', requirement: { anyOf: ['dashboard:read'] } },
  { prefix: '/products', requirement: { anyOf: ['catalog:read'] } },
  { prefix: '/invoices', requirement: { anyOf: ['billing:read'] } },
  { prefix: '/returns', requirement: { anyOf: ['billing:read'] } },
  { prefix: '/reports', requirement: { anyOf: ['finance:read', 'sales:read'] } },
  { prefix: '/pricing', requirement: { anyOf: ['catalog:read'] } },
  { prefix: '/clients', requirement: { anyOf: ['clients:read'] } },
  { prefix: '/support', requirement: { anyOf: ['support:write'] } },
  { prefix: '/users', requirement: { anyOf: ['users:read'] } },
]

const API_RULES: RouteRule[] = [
  // ── /api/admin/* ──
  { prefix: '/api/admin/db/migrate', requirement: { allOf: ['system:migrate'] } },
  { prefix: '/api/admin/users', requirement: { anyOf: ['users:read', 'users:write', 'users:roles'] } },
  { prefix: '/api/admin/fulfillment', requirement: { anyOf: ['fulfillment:read', 'fulfillment:write'] } },
  { prefix: '/api/admin/package-photos', requirement: { anyOf: ['fulfillment:read', 'fulfillment:write'] } },
  { prefix: '/api/admin/shipping', requirement: { anyOf: ['fulfillment:read', 'fulfillment:write'] } },
  { prefix: '/api/admin/orders', requirement: { anyOf: ['fulfillment:read', 'fulfillment:write', 'sales:read'] } },
  { prefix: '/api/admin/client-pricing', requirement: { anyOf: ['catalog:read', 'catalog:write'] } },
  { prefix: '/api/admin/purchase-orders', requirement: { anyOf: ['catalog:read', 'catalog:write'] } },
  { prefix: '/api/admin/inventory', requirement: { anyOf: ['catalog:read', 'catalog:write'] } },
  { prefix: '/api/admin/products', requirement: { anyOf: ['catalog:read', 'catalog:write'] } },
  { prefix: '/api/admin/suppliers', requirement: { anyOf: ['catalog:read', 'catalog:write'] } },
  { prefix: '/api/admin/competitors', requirement: { anyOf: ['sales:read', 'sales:write'] } },
  { prefix: '/api/admin/invoices', requirement: { anyOf: ['billing:read', 'billing:write'] } },
  { prefix: '/api/admin/returns', requirement: { anyOf: ['billing:read', 'billing:write'] } },
  { prefix: '/api/admin/reports', requirement: { anyOf: ['finance:read', 'sales:read'] } },
  { prefix: '/api/admin/sales', requirement: { anyOf: ['sales:read', 'sales:write', 'finance:read'] } },
  { prefix: '/api/admin/partners', requirement: { anyOf: ['partners:read', 'partners:write'] } },
  { prefix: '/api/admin/storefronts', requirement: { anyOf: ['storefronts:read', 'storefronts:write'] } },
  { prefix: '/api/admin/articles', requirement: { anyOf: ['resources:write'] } },
  { prefix: '/api/admin/support', requirement: { anyOf: ['support:write'] } },
  { prefix: '/api/admin/clients', requirement: { anyOf: ['clients:read', 'clients:write'] } },
  { prefix: '/api/admin/patients', requirement: { anyOf: ['clients:read', 'clients:write'] } },
  { prefix: '/api/admin/webhook-events', requirement: { anyOf: ['settings:write'] } },
  { prefix: '/api/admin/notifications', requirement: { staff: true } },
  { prefix: '/api/admin/ops', requirement: { anyOf: ['settings:write', 'system:migrate'] } },
  { prefix: '/api/admin', requirement: { staff: true } },

  // ── Legacy admin APIs outside /api/admin ──
  { prefix: '/api/inventory', requirement: { anyOf: ['catalog:read', 'catalog:write'] } },
  { prefix: '/api/competitors', requirement: { anyOf: ['sales:read', 'sales:write'] } },
  { prefix: '/api/sales', requirement: { anyOf: ['sales:read', 'sales:write', 'finance:read'] } },
  { prefix: '/api/orders', requirement: { anyOf: ['fulfillment:read', 'fulfillment:write', 'sales:read'] } },
  { prefix: '/api/prices', requirement: { anyOf: ['catalog:read', 'catalog:write'] } },
  { prefix: '/api/stripe', requirement: { anyOf: ['settings:write', 'billing:write'] } },
]

function matchRule(pathname: string, rules: RouteRule[]): RoutePermissionRequirement | null {
  for (const rule of rules) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      return rule.requirement
    }
  }
  return null
}

/** Permission requirement for an admin page path, or null if not an admin page we map. */
export function permissionForAdminPage(pathname: string): RoutePermissionRequirement | null {
  return matchRule(pathname, PAGE_RULES)
}

/** Permission requirement for an admin/legacy staff API path. */
export function permissionForAdminApi(pathname: string): RoutePermissionRequirement | null {
  return matchRule(pathname, API_RULES)
}

/** Whether the caller's effective permissions satisfy a route requirement. */
export function satisfiesRoutePermission(
  permissions: readonly Permission[],
  requirement: RoutePermissionRequirement,
  isStaff: boolean
): boolean {
  if ('staff' in requirement && requirement.staff) return isStaff
  if ('allOf' in requirement) return hasAllPermissions(permissions, requirement.allOf)
  if ('anyOf' in requirement) return hasAnyPermission(permissions, requirement.anyOf)
  return false
}

/**
 * Nav link href → permission needed to show the link.
 * Keep in sync with PAGE_RULES / AdminHeader.
 */
export const NAV_LINK_PERMISSIONS: Record<string, Permission | Permission[]> = {
  '/dashboard': 'dashboard:read',
  '/fulfillment': 'fulfillment:read',
  '/customers': 'sales:read',
  '/orders-expenses': 'sales:read',
  '/profit-loss': 'finance:read',
  '/reports': ['finance:read', 'sales:read'],
  '/competitors': 'sales:read',
  '/products': 'catalog:read',
  '/inventory': 'catalog:read',
  '/pricing': 'catalog:read',
  '/pricing/client-pricing': 'catalog:read',
  '/po-generator': 'catalog:read',
  '/invoices': 'billing:read',
  '/returns': 'billing:read',
  '/clients': 'clients:read',
  '/users': 'users:read',
  '/partners-admin': 'partners:read',
  '/storefronts': 'storefronts:read',
  '/resources': 'resources:write',
  '/package-photos': 'fulfillment:read',
  '/support': 'support:write',
  '/settings/stripe': 'settings:write',
  '/settings/webhooks': 'settings:write',
}
