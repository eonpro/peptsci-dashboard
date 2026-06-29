import { prisma } from '@/lib/prisma'

/**
 * Resolve the internal `User.id` (cuid) for the current admin from their Clerk
 * id. In local dev (Clerk unconfigured, `clerkUserId === 'dev-user'`) we fall
 * back to the first ACTIVE admin so the notification UI is usable without a
 * real Clerk session. In production an unmatched id resolves to null.
 */
export async function resolveAdminUserId(clerkUserId: string | null): Promise<string | null> {
  if (!prisma) return null

  if (clerkUserId && clerkUserId !== 'dev-user') {
    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true },
    })
    if (user) return user.id
  }

  if (process.env.NODE_ENV !== 'production') {
    const admin = await prisma.user.findFirst({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    return admin?.id ?? null
  }

  return null
}
