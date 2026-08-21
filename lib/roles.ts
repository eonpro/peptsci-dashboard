import { auth, currentUser } from '@clerk/nextjs/server'
import {
  defaultRouteForRole,
  isStaffRole,
  type UserRole,
  type UserStatus,
} from './access'
import { resolvePermissions, type Permission } from './permissions'

export type { UserRole, UserStatus }

export const VALID_USER_ROLES: UserRole[] = [
  'CLIENT',
  'ADMIN',
  'SUPER_ADMIN',
  'PARTNER',
  'FULFILLMENT',
  'BILLING',
  'CATALOG',
  'FINANCE_VIEWER',
]

export interface UserMetadata {
  role: UserRole
  status: UserStatus
  clientId?: string
  permissionsGrant?: Permission[]
  permissionsDeny?: Permission[]
}

function asRole(value: unknown): UserRole {
  return typeof value === 'string' && VALID_USER_ROLES.includes(value as UserRole)
    ? (value as UserRole)
    : 'CLIENT'
}

/**
 * Get the current user's role from Clerk session claims.
 * Falls back to 'CLIENT' if not set.
 */
export async function getUserRole(): Promise<UserRole> {
  const { sessionClaims } = await auth()
  return asRole((sessionClaims?.metadata as UserMetadata | undefined)?.role)
}

/**
 * Get the current user's status from Clerk session claims.
 * Falls back to 'PENDING' if not set.
 */
export async function getUserStatus(): Promise<UserStatus> {
  const { sessionClaims } = await auth()
  return (sessionClaims?.metadata as UserMetadata)?.status || 'PENDING'
}

/**
 * Get the full user metadata from Clerk session claims.
 * In dev without Clerk configured, auth() throws (no clerkMiddleware); fall
 * back to anonymous defaults so pages still render, matching the dev-mode
 * bypass used by the admin API routes.
 */
export async function getUserMetadata(): Promise<UserMetadata> {
  try {
    const { sessionClaims } = await auth()
    const metadata = sessionClaims?.metadata as UserMetadata | undefined
    const role = asRole(metadata?.role)
    return {
      role,
      status: metadata?.status || 'PENDING',
      clientId: metadata?.clientId,
      permissionsGrant: metadata?.permissionsGrant,
      permissionsDeny: metadata?.permissionsDeny,
    }
  } catch {
    if (process.env.NODE_ENV !== 'development') throw new Error('Authentication unavailable')
    return { role: 'CLIENT', status: 'PENDING', clientId: undefined }
  }
}

/**
 * Effective staff permissions for the current session.
 */
export async function getUserPermissions(): Promise<Permission[]> {
  const meta = await getUserMetadata()
  return resolvePermissions({
    role: meta.role,
    permissionsGrant: meta.permissionsGrant,
    permissionsDeny: meta.permissionsDeny,
  })
}

/**
 * Check if the current user is staff (any admin console role).
 */
export async function isAdmin(): Promise<boolean> {
  const role = await getUserRole()
  return isStaffRole(role)
}

/**
 * Check if the current user is a super admin.
 */
export async function isSuperAdmin(): Promise<boolean> {
  const role = await getUserRole()
  return role === 'SUPER_ADMIN'
}

/**
 * Check if the current user is approved (status is ACTIVE).
 */
export async function isApproved(): Promise<boolean> {
  const status = await getUserStatus()
  return status === 'ACTIVE'
}

/**
 * Get the current user's Clerk data with metadata.
 */
export async function getCurrentUserWithMetadata() {
  const user = await currentUser()
  if (!user) return null

  const metadata = user.publicMetadata as unknown as UserMetadata | undefined
  const role = asRole(metadata?.role)

  return {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
    role,
    status: metadata?.status || 'PENDING',
    clientId: metadata?.clientId,
    permissionsGrant: metadata?.permissionsGrant ?? [],
    permissionsDeny: metadata?.permissionsDeny ?? [],
    permissions: resolvePermissions({
      role,
      permissionsGrant: metadata?.permissionsGrant,
      permissionsDeny: metadata?.permissionsDeny,
    }),
  }
}

/**
 * Determine the correct redirect URL based on user role.
 */
export function getRedirectUrl(role: UserRole): string {
  return defaultRouteForRole(role)
}
