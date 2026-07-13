import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { logger } from './logger'
import { isAdminRole, isSuperAdminRole, type UserRole, type UserStatus } from './access'

// Check if Clerk is configured
const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

// Dev-only auth bypass is allowed when Clerk isn't configured. In production a
// missing/invalid Clerk key must NEVER fall open — we deny instead.
const isProduction = process.env.NODE_ENV === 'production'

export interface AuthResult {
  userId: string | null
  isAuthenticated: boolean
  /** Account status from Clerk metadata. SUSPENDED accounts are denied. */
  status?: UserStatus | null
  /** True when the account has been suspended (access must be denied). */
  isSuspended?: boolean
}

export interface AdminAuthResult extends AuthResult {
  role: UserRole | null
  isAdmin: boolean
  isSuperAdmin: boolean
}

/**
 * Read the account status from Clerk session claims metadata.
 * Defaults to PENDING when unset (never silently ACTIVE).
 */
function statusFromClaims(sessionClaims: unknown): UserStatus {
  const meta = (sessionClaims as { metadata?: { status?: UserStatus } } | null)?.metadata
  return meta?.status ?? 'PENDING'
}

/**
 * Validates that a request is authenticated via Clerk.
 * Returns the userId if authenticated, null otherwise.
 * If Clerk is not configured, allows all requests (dev mode).
 */
export async function requireAuth(): Promise<AuthResult> {
  // If Clerk is not configured, allow requests in development only. In
  // production this must fail closed to avoid an open auth bypass.
  if (!isClerkConfigured) {
    if (isProduction) {
      logger.error('Clerk not configured in production - denying request (fail closed)')
      return { userId: null, isAuthenticated: false }
    }
    logger.warn('Clerk not configured - auth bypassed (dev mode)')
    return {
      userId: 'dev-user',
      isAuthenticated: true,
    }
  }

  try {
    const { userId, sessionClaims } = await auth()
    const status = userId ? statusFromClaims(sessionClaims) : null
    const isSuspended = status === 'SUSPENDED'
    // A suspended account must be denied even with a valid Clerk session.
    return {
      userId,
      isAuthenticated: !!userId && !isSuspended,
      status,
      isSuspended,
    }
  } catch (error) {
    logger.error('Auth error', {}, error instanceof Error ? error : new Error(String(error)))
    return {
      userId: null,
      isAuthenticated: false,
      status: null,
      isSuspended: false,
    }
  }
}

/**
 * Resolve the caller's role and admin status from the Clerk session.
 *
 * Reads role from `sessionClaims.metadata.role` (requires the Clerk session
 * token to expose `{"metadata": "{{user.public_metadata}}"}`). When Clerk is
 * not configured (local dev), treats the caller as SUPER_ADMIN to match the
 * dev-bypass behavior elsewhere.
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
  if (!isClerkConfigured) {
    if (isProduction) {
      logger.error('Clerk not configured in production - denying admin request (fail closed)')
      return { userId: null, isAuthenticated: false, role: null, isAdmin: false, isSuperAdmin: false }
    }
    logger.warn('Clerk not configured - admin auth bypassed (dev mode)')
    return {
      userId: 'dev-user',
      isAuthenticated: true,
      role: 'SUPER_ADMIN',
      isAdmin: true,
      isSuperAdmin: true,
    }
  }

  try {
    const { userId, sessionClaims } = await auth()
    const role =
      ((sessionClaims?.metadata as { role?: UserRole } | undefined)?.role as UserRole) ?? 'CLIENT'
    const status = userId ? statusFromClaims(sessionClaims) : null
    const isSuspended = status === 'SUSPENDED'
    // Suspended accounts lose admin access regardless of their role.
    const authed = !!userId && !isSuspended
    return {
      userId,
      isAuthenticated: authed,
      status,
      isSuspended,
      role,
      isAdmin: authed && isAdminRole(role),
      isSuperAdmin: authed && isSuperAdminRole(role),
    }
  } catch (error) {
    logger.error('Admin auth error', {}, error instanceof Error ? error : new Error(String(error)))
    return {
      userId: null,
      isAuthenticated: false,
      status: null,
      isSuspended: false,
      role: null,
      isAdmin: false,
      isSuperAdmin: false,
    }
  }
}

/**
 * Like requireAdmin but for SUPER_ADMIN-only operations (e.g. role changes).
 *
 * Returns the resolved auth result with `isAdmin` forced to reflect SUPER_ADMIN
 * elevation: a plain ADMIN is treated as NOT authorized (isAdmin=false) so
 * callers that gate on `isAdmin` can't be satisfied by a non-super admin.
 * Callers should still prefer to check `isSuperAdmin` explicitly.
 */
export async function requireSuperAdmin(): Promise<AdminAuthResult> {
  const result = await requireAdmin()
  if (!result.isSuperAdmin) {
    return { ...result, isAdmin: false }
  }
  return result
}

/**
 * Creates an unauthorized response with a consistent format.
 */
export function unauthorizedResponse(message = 'Authentication required') {
  return NextResponse.json(
    {
      error: 'Unauthorized',
      message,
      code: 'AUTH_REQUIRED',
    },
    { status: 401 }
  )
}

/**
 * Creates a forbidden response for insufficient permissions.
 */
export function forbiddenResponse(message = 'Insufficient permissions') {
  return NextResponse.json(
    {
      error: 'Forbidden',
      message,
      code: 'INSUFFICIENT_PERMISSIONS',
    },
    { status: 403 }
  )
}

/**
 * Creates a standardized error response.
 */
export function errorResponse(message: string, status = 500, code = 'INTERNAL_ERROR') {
  // 4xx messages are intentionally user-facing (validation, stock, terms
  // gates) and must survive to the client so checkout failures are
  // actionable. Only 5xx messages (which can leak internals) are masked
  // in production.
  const maskMessage = status >= 500 && process.env.NODE_ENV === 'production'
  return NextResponse.json(
    {
      error: status >= 500 ? 'Internal Server Error' : 'Bad Request',
      message: maskMessage ? 'An error occurred' : message,
      code,
    },
    { status }
  )
}

/**
 * Creates a standardized success response.
 */
export function successResponse<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>
) {
  return NextResponse.json(data, { status, headers })
}
