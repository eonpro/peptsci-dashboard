'use client'

import { useMemo } from 'react'
import { useUser } from '@clerk/nextjs'
import { isClerkConfigured } from '@/lib/clerk-config'

export type UserRole = 'CLIENT' | 'ADMIN' | 'SUPER_ADMIN'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

export interface UserRoleInfo {
  role: UserRole
  status: UserStatus
  clientId?: string
  isAdmin: boolean
  isSuperAdmin: boolean
  isClient: boolean
  isApproved: boolean
  isPending: boolean
  isLoading: boolean
}

/**
 * Client-side hook to get the current user's role and status.
 * Uses Clerk's useUser hook and reads from publicMetadata.
 * Falls back to mock data when Clerk is not configured.
 */
export function useRole(): UserRoleInfo {
  // When Clerk is not configured, return mock admin data for development
  const mockData = useMemo(
    () => ({
      role: 'ADMIN' as UserRole,
      status: 'ACTIVE' as UserStatus,
      clientId: undefined,
      isAdmin: true,
      isSuperAdmin: false,
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
        }
      | undefined

    const role = metadata?.role || 'CLIENT'
    const status = metadata?.status || 'PENDING'

    return {
      role,
      status,
      clientId: metadata?.clientId,
      isAdmin: role === 'ADMIN' || role === 'SUPER_ADMIN',
      isSuperAdmin: role === 'SUPER_ADMIN',
      isClient: role === 'CLIENT',
      isApproved: status === 'ACTIVE',
      isPending: status === 'PENDING',
      isLoading: !isLoaded,
    }
  }, [user, isLoaded])
}
