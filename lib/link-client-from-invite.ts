/**
 * Self-heal for CLIENT invites: invitation publicMetadata carries `clientId`
 * (and usually ACTIVE status). The Clerk webhook normally links User.clientId
 * on user.created, but delivery can lag behind the first post-signup request.
 * Partners already self-heal from claims; this mirrors that for clinics.
 *
 * Idempotent and safe: only links when the User has no clientId yet, and only
 * to a Client that actually exists. Never steals another account's practice.
 */

import { auth, currentUser } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import type { UserRole, UserStatus } from '@/lib/roles'

const VALID_ROLES: UserRole[] = ['CLIENT', 'ADMIN', 'SUPER_ADMIN', 'PARTNER']
const VALID_STATUSES: UserStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED']

export interface InviteClientClaims {
  clientId?: string
  role?: UserRole
  status?: UserStatus
}

function asRole(value: unknown): UserRole | undefined {
  return typeof value === 'string' && VALID_ROLES.includes(value as UserRole)
    ? (value as UserRole)
    : undefined
}

function asStatus(value: unknown): UserStatus | undefined {
  return typeof value === 'string' && VALID_STATUSES.includes(value as UserStatus)
    ? (value as UserStatus)
    : undefined
}

/** Read invite client linkage from session JWT, falling back to live Clerk user. */
export async function readInviteClientClaims(): Promise<InviteClientClaims> {
  try {
    const { sessionClaims } = await auth()
    const fromSession = sessionClaims?.metadata as
      | { clientId?: string; role?: string; status?: string }
      | undefined
    if (fromSession?.clientId) {
      return {
        clientId: fromSession.clientId,
        role: asRole(fromSession.role),
        status: asStatus(fromSession.status),
      }
    }
  } catch {
    /* auth unavailable */
  }

  try {
    const user = await currentUser()
    const meta = user?.publicMetadata as
      | { clientId?: string; role?: string; status?: string }
      | undefined
    if (meta?.clientId) {
      return {
        clientId: meta.clientId,
        role: asRole(meta.role),
        status: asStatus(meta.status),
      }
    }
  } catch {
    /* Clerk user unavailable */
  }

  return {}
}

/**
 * If the Clerk user is invited to an existing Client but the local User row
 * is not linked yet, link it. Returns the linked clientId when resolved.
 */
export async function ensureUserLinkedToInviteClient(
  clerkUserId: string,
  claims?: InviteClientClaims
): Promise<string | null> {
  if (!prisma) return null

  const resolved = claims ?? (await readInviteClientClaims())
  const claimedClientId = resolved.clientId
  if (!claimedClientId) return null

  const client = await prisma.client.findUnique({
    where: { id: claimedClientId },
    select: { id: true },
  })
  if (!client) return null

  const existing = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, clientId: true },
  })

  if (existing?.clientId) {
    // Already linked — only treat as success when it matches the invite.
    return existing.clientId === client.id ? client.id : null
  }

  const role = resolved.role ?? 'CLIENT'
  const status = resolved.status ?? 'ACTIVE'

  await prisma.user.upsert({
    where: { clerkUserId },
    update: {
      clientId: client.id,
      ...(resolved.role ? { role } : {}),
      ...(resolved.status ? { status } : {}),
    },
    create: {
      clerkUserId,
      clientId: client.id,
      role,
      status,
    },
  })

  return client.id
}
