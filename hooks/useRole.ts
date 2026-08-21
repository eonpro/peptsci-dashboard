'use client'

import { useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { isClerkConfigured } from '@/lib/clerk-config'
import { isStaffRole, type UserRole, type UserStatus } from '@/lib/access'
import {
  resolvePermissions,
  type Permission,
} from '@/lib/permissions'

export type { UserRole, UserStatus }

export interface UserRoleInfo {
  role: UserRole
  status: UserStatus
  clientId?: string
  permissions: Permission[]
  permissionsGrant: Permission[]
  permissionsDeny: Permission[]
  isAdmin: boolean
  isSuperAdmin: boolean
  isClient: boolean
  isApproved: boolean
  isPending: boolean
  isLoading: boolean
}

/**
 * Client-side hook to get the current user's role, status, and effective
 * staff permissions. Uses Clerk's useUser and publicMetadata.
 */
export function useRole(): UserRoleInfo {
  const mockData = useMemo(
    () => ({
      role: 'SUPER_ADMIN' as UserRole,
      status: 'ACTIVE' as UserStatus,
      clientId: undefined,
      permissions: resolvePermissions({ role: 'SUPER_ADMIN' }),
      permissionsGrant: [] as Permission[],
      permissionsDeny: [] as Permission[],
      isAdmin: true,
      isSuperAdmin: true,
      isClient: false,
      isApproved: true,
      isPending: false,
      isLoading: false,
    }),
    []
  )

  if (!isClerkConfigured) {
    return mockData
  }

  // Clerk is configured - use the actual Clerk hook.
  // `isClerkConfigured` is a build-time constant, so hook order is stable.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { user, isLoaded } = useUser()

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useMemo(() => {
    const metadata = user?.publicMetadata as
      | {
          role?: UserRole
          status?: UserStatus
          clientId?: string
          permissionsGrant?: Permission[]
          permissionsDeny?: Permission[]
        }
      | undefined

    const role = (metadata?.role || 'CLIENT') as UserRole
    const status = (metadata?.status || 'PENDING') as UserStatus
    const permissionsGrant = Array.isArray(metadata?.permissionsGrant)
      ? metadata!.permissionsGrant!
      : []
    const permissionsDeny = Array.isArray(metadata?.permissionsDeny)
      ? metadata!.permissionsDeny!
      : []

    return {
      role,
      status,
      clientId: metadata?.clientId,
      permissionsGrant,
      permissionsDeny,
      permissions: resolvePermissions({
        role,
        permissionsGrant,
        permissionsDeny,
      }),
      isAdmin: isStaffRole(role),
      isSuperAdmin: role === 'SUPER_ADMIN',
      isClient: role === 'CLIENT',
      isApproved: status === 'ACTIVE',
      isPending: status === 'PENDING',
      isLoading: !isLoaded,
    }
  }, [user, isLoaded])
}
