/**
 * Resolve the DB User.id to stamp on an admin-created order's `createdById`
 * (a required FK). `requireAdmin()` yields a Clerk user id, so we map it to the
 * local User row. When the acting user can't be resolved (dev bypass, or an
 * automated path with no session), we fall back to any admin/super-admin user
 * so the FK is always satisfiable.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export class NoOrderActorError extends Error {
  code = 'NO_ORDER_ACTOR'
  constructor(message = 'No admin user available to attribute this order') {
    super(message)
    this.name = 'NoOrderActorError'
  }
}

/**
 * Return a valid User.id for `Order.createdById`. Prefers the acting admin
 * (matched by Clerk id); otherwise the earliest ADMIN/SUPER_ADMIN user.
 * Throws {@link NoOrderActorError} when no admin user exists at all.
 */
export async function resolveOrderCreatorId(clerkUserId: string | null | undefined): Promise<string> {
  if (!prisma) throw new Error('Database not connected')

  if (clerkUserId && clerkUserId !== 'dev-user') {
    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true },
    })
    if (user) return user.id
    logger.warn('[ORDERS] Acting user not found by Clerk id; using admin fallback', { clerkUserId })
  }

  const fallback = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (fallback) return fallback.id

  throw new NoOrderActorError()
}
