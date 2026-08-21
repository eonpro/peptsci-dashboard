/**
 * Staff permission catalog + role defaults + grant/deny resolution.
 *
 * Pure helpers (no Clerk/Prisma) so middleware, auth guards, and unit tests
 * share one source of truth.
 *
 * Effective set: (ROLE_DEFAULTS[role] ∪ permissionsGrant) \ permissionsDeny
 * SUPER_ADMIN always gets ALL_PERMISSIONS (deny is ignored).
 */

import type { UserRole } from './access'
import { isStaffRole } from './access'

export const PERMISSIONS = [
  'dashboard:read',
  'notifications:read',
  'fulfillment:read',
  'fulfillment:write',
  'sales:read',
  'sales:write',
  'finance:read',
  'catalog:read',
  'catalog:write',
  'billing:read',
  'billing:write',
  'clients:read',
  'clients:write',
  'users:read',
  'users:write',
  'users:roles',
  'partners:read',
  'partners:write',
  'storefronts:read',
  'storefronts:write',
  'resources:write',
  'support:write',
  'settings:write',
  'system:migrate',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS

const ALL_SET = new Set<Permission>(ALL_PERMISSIONS)

/** Human labels for the Users override UI. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard:read': 'Dashboard',
  'notifications:read': 'Notifications',
  'fulfillment:read': 'Fulfillment (view)',
  'fulfillment:write': 'Fulfillment (edit)',
  'sales:read': 'Sales (view)',
  'sales:write': 'Sales (edit)',
  'finance:read': 'Finance (view)',
  'catalog:read': 'Catalog (view)',
  'catalog:write': 'Catalog (edit)',
  'billing:read': 'Billing (view)',
  'billing:write': 'Billing (edit)',
  'clients:read': 'Clients (view)',
  'clients:write': 'Clients (edit)',
  'users:read': 'Users (view)',
  'users:write': 'Users (edit)',
  'users:roles': 'Users (assign roles)',
  'partners:read': 'Partners (view)',
  'partners:write': 'Partners (edit)',
  'storefronts:read': 'Storefronts (view)',
  'storefronts:write': 'Storefronts (edit)',
  'resources:write': 'Resources (edit)',
  'support:write': 'Support (edit)',
  'settings:write': 'Settings (edit)',
  'system:migrate': 'Run DB migrations',
}

const ADMIN_DEFAULTS: Permission[] = ALL_PERMISSIONS.filter(
  (p) => p !== 'users:roles' && p !== 'system:migrate'
)

const FULFILLMENT_DEFAULTS: Permission[] = [
  'dashboard:read',
  'notifications:read',
  'fulfillment:read',
  'fulfillment:write',
  'catalog:read',
  'clients:read',
]

const BILLING_DEFAULTS: Permission[] = [
  'dashboard:read',
  'notifications:read',
  'billing:read',
  'billing:write',
  'clients:read',
  'finance:read',
  'sales:read',
]

const CATALOG_DEFAULTS: Permission[] = [
  'dashboard:read',
  'notifications:read',
  'catalog:read',
  'catalog:write',
]

const FINANCE_VIEWER_DEFAULTS: Permission[] = [
  'dashboard:read',
  'notifications:read',
  'finance:read',
  'sales:read',
  'billing:read',
]

/** Default permission sets keyed by staff role. Non-staff → empty. */
export const ROLE_DEFAULTS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ADMIN_DEFAULTS,
  FULFILLMENT: FULFILLMENT_DEFAULTS,
  BILLING: BILLING_DEFAULTS,
  CATALOG: CATALOG_DEFAULTS,
  FINANCE_VIEWER: FINANCE_VIEWER_DEFAULTS,
  CLIENT: [],
  PARTNER: [],
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && ALL_SET.has(value as Permission)
}

/** Filter unknown strings down to valid Permission values (stable order). */
export function sanitizePermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) return []
  const out: Permission[] = []
  const seen = new Set<Permission>()
  for (const v of values) {
    if (isPermission(v) && !seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/**
 * Resolve effective permissions for a role + optional grant/deny overrides.
 * Overrides only apply to staff roles; SUPER_ADMIN always gets everything.
 */
export function resolvePermissions(input: {
  role: string | undefined | null
  permissionsGrant?: unknown
  permissionsDeny?: unknown
}): Permission[] {
  const role = (input.role ?? 'CLIENT') as UserRole
  if (role === 'SUPER_ADMIN') return [...ALL_PERMISSIONS]
  if (!isStaffRole(role)) return []

  const base = ROLE_DEFAULTS[role] ?? []
  const grant = sanitizePermissions(input.permissionsGrant)
  const deny = new Set(sanitizePermissions(input.permissionsDeny))

  const merged = new Set<Permission>([...base, ...grant])
  for (const p of deny) merged.delete(p)
  return ALL_PERMISSIONS.filter((p) => merged.has(p))
}

export function hasPermission(
  permissions: readonly Permission[] | undefined | null,
  need: Permission
): boolean {
  return !!permissions?.includes(need)
}

export function hasAllPermissions(
  permissions: readonly Permission[] | undefined | null,
  need: readonly Permission[]
): boolean {
  if (!permissions || permissions.length === 0) return need.length === 0
  const set = new Set(permissions)
  return need.every((p) => set.has(p))
}

export function hasAnyPermission(
  permissions: readonly Permission[] | undefined | null,
  need: readonly Permission[]
): boolean {
  if (!need.length) return true
  if (!permissions?.length) return false
  const set = new Set(permissions)
  return need.some((p) => set.has(p))
}

/**
 * Preferred staff landing path given effective permissions (+ optional role hint).
 * Full admins prefer /dashboard; presets prefer their specialty surface.
 */
export function staffHomeForPermissions(
  permissions: readonly Permission[],
  role?: string | null
): string {
  if (
    (role === 'ADMIN' || role === 'SUPER_ADMIN') &&
    hasPermission(permissions, 'dashboard:read')
  ) {
    return '/dashboard'
  }

  const byRole: Record<string, { permission: Permission; href: string }> = {
    FULFILLMENT: { permission: 'fulfillment:read', href: '/fulfillment' },
    BILLING: { permission: 'billing:read', href: '/invoices' },
    CATALOG: { permission: 'catalog:read', href: '/products' },
    FINANCE_VIEWER: { permission: 'finance:read', href: '/profit-loss' },
  }
  if (role && byRole[role] && hasPermission(permissions, byRole[role].permission)) {
    return byRole[role].href
  }

  const candidates: { permission: Permission; href: string }[] = [
    { permission: 'fulfillment:read', href: '/fulfillment' },
    { permission: 'billing:read', href: '/invoices' },
    { permission: 'finance:read', href: '/profit-loss' },
    { permission: 'catalog:read', href: '/products' },
    { permission: 'sales:read', href: '/customers' },
    { permission: 'clients:read', href: '/clients' },
    { permission: 'dashboard:read', href: '/dashboard' },
  ]
  for (const c of candidates) {
    if (hasPermission(permissions, c.permission)) return c.href
  }
  return '/dashboard'
}
