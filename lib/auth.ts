import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { logger } from './logger'

// Check if Clerk is configured
const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

export interface AuthResult {
  userId: string | null
  isAuthenticated: boolean
}

/**
 * Validates that a request is authenticated via Clerk.
 * Returns the userId if authenticated, null otherwise.
 * If Clerk is not configured, allows all requests (dev mode).
 */
export async function requireAuth(): Promise<AuthResult> {
  // If Clerk is not configured, allow requests (development mode)
  if (!isClerkConfigured) {
    logger.warn('Clerk not configured - auth bypassed')
    return {
      userId: 'dev-user',
      isAuthenticated: true,
    }
  }
  
  try {
    const { userId } = await auth()
    return {
      userId,
      isAuthenticated: !!userId,
    }
  } catch (error) {
    logger.error('Auth error', {}, error instanceof Error ? error : new Error(String(error)))
    return {
      userId: null,
      isAuthenticated: false,
    }
  }
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
export function errorResponse(
  message: string,
  status = 500,
  code = 'INTERNAL_ERROR'
) {
  return NextResponse.json(
    {
      error: status >= 500 ? 'Internal Server Error' : 'Bad Request',
      message: process.env.NODE_ENV === 'production' 
        ? 'An error occurred' 
        : message,
      code,
    },
    { status }
  )
}

/**
 * Creates a standardized success response.
 */
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}
