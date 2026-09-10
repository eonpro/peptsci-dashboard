/**
 * Shared guard for /api/admin/messages/* — staff session + DB, resolving the
 * internal User.id for assignment / sender attribution. Route-level permission
 * (support:write) is enforced by lib/admin-route-permissions via middleware.
 *
 * @module lib/sms/inbox-auth
 */

import type { NextResponse } from 'next/server'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse } from '../auth'
import { prisma } from '../prisma'
import { resolveAdminUserId } from '../notifications/current-user'

export type InboxGuard =
  | { ok: true; clerkUserId: string | null; userId: string | null }
  | { ok: false; response: NextResponse }

export async function requireInboxStaff(): Promise<InboxGuard> {
  const { isAuthenticated, isAdmin, userId: clerkUserId } = await requireAdmin()
  if (!isAuthenticated) return { ok: false, response: unauthorizedResponse() }
  if (!isAdmin) return { ok: false, response: forbiddenResponse('Staff access required') }
  if (!prisma) {
    return { ok: false, response: errorResponse('Database not connected', 503, 'DB_UNAVAILABLE') }
  }
  const userId = await resolveAdminUserId(clerkUserId ?? null)
  return { ok: true, clerkUserId: clerkUserId ?? null, userId }
}
