import { auth, currentUser } from '@clerk/nextjs/server'

export type UserRole = 'CLIENT' | 'ADMIN' | 'SUPER_ADMIN' | 'PARTNER'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

export interface UserMetadata {
  role: UserRole
  status: UserStatus
  clientId?: string
}

/**
 * Get the current user's role from Clerk session claims.
 * Falls back to 'CLIENT' if not set.
 */
export async function getUserRole(): Promise<UserRole> {
  const { sessionClaims } = await auth()
  return (sessionClaims?.metadata as UserMetadata)?.role || 'CLIENT'
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
    return {
      role: metadata?.role || 'CLIENT',
      status: metadata?.status || 'PENDING',
      clientId: metadata?.clientId,
    }
  } catch {
    if (process.env.NODE_ENV !== 'development') throw new Error('Authentication unavailable')
    return { role: 'CLIENT', status: 'PENDING', clientId: undefined }
  }
}

/**
 * Check if the current user is an admin.
 */
export async function isAdmin(): Promise<boolean> {
  const role = await getUserRole()
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
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

  return {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
    role: metadata?.role || 'CLIENT',
    status: metadata?.status || 'PENDING',
    clientId: metadata?.clientId,
  }
}

/**
 * Determine the correct redirect URL based on user role.
 */
export function getRedirectUrl(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
    case 'SUPER_ADMIN':
      return '/dashboard'
    case 'PARTNER':
      return '/partners'
    case 'CLIENT':
    default:
      return '/shop'
  }
}
