/**
 * Resolve the local user + client for a Clerk-authenticated shop caller.
 * Falls back to the first client-linked user in local dev (no Clerk).
 */
import { prisma } from '@/lib/prisma'

export interface ShopActor {
  userId: string
  clientId: string
  /** Practice approval state — ordering mutations require APPROVED. */
  clientApproved: boolean
}

export async function resolveShopActor(clerkUserId: string): Promise<ShopActor | null> {
  if (!prisma) return null
  let user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, clientId: true, client: { select: { onboardingStatus: true } } },
  })
  if (!user && clerkUserId === 'dev-user') {
    user = await prisma.user.findFirst({
      where: { clientId: { not: null } },
      select: { id: true, clientId: true, client: { select: { onboardingStatus: true } } },
    })
  }
  if (!user || !user.clientId) return null
  return {
    userId: user.id,
    clientId: user.clientId,
    clientApproved: user.client?.onboardingStatus === 'APPROVED',
  }
}

export async function resolveShopClientId(clerkUserId: string): Promise<string | null> {
  const actor = await resolveShopActor(clerkUserId)
  return actor?.clientId ?? null
}
