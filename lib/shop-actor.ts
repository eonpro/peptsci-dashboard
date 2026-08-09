/**
 * Resolve the local user + client for a Clerk-authenticated shop caller.
 * Falls back to the first client-linked user in local dev (no Clerk).
 * Invited users self-heal User.clientId from Clerk invite metadata when the
 * webhook hasn't linked them yet.
 */
import { prisma } from '@/lib/prisma'
import { ensureUserLinkedToInviteClient } from '@/lib/link-client-from-invite'

export interface ShopActor {
  userId: string
  clientId: string
  /** Practice approval state — ordering mutations require APPROVED. */
  clientApproved: boolean
  /** At-cost pricing: this clinic pays ProductVariant.unitCost per vial. */
  paysAtCost: boolean
}

async function loadShopUser(clerkUserId: string) {
  return prisma!.user.findUnique({
    where: { clerkUserId },
    select: {
      id: true,
      clientId: true,
      client: { select: { onboardingStatus: true, paysAtCost: true } },
    },
  })
}

export async function resolveShopActor(clerkUserId: string): Promise<ShopActor | null> {
  if (!prisma) return null
  let user = await loadShopUser(clerkUserId)
  if (!user && clerkUserId === 'dev-user') {
    user = await prisma.user.findFirst({
      where: { clientId: { not: null } },
      select: {
        id: true,
        clientId: true,
        client: { select: { onboardingStatus: true, paysAtCost: true } },
      },
    })
  }

  if (user && !user.clientId && clerkUserId !== 'dev-user') {
    const linkedId = await ensureUserLinkedToInviteClient(clerkUserId)
    if (linkedId) user = await loadShopUser(clerkUserId)
  }

  if (!user || !user.clientId) return null
  return {
    userId: user.id,
    clientId: user.clientId,
    clientApproved: user.client?.onboardingStatus === 'APPROVED',
    paysAtCost: user.client?.paysAtCost ?? false,
  }
}

export async function resolveShopClientId(clerkUserId: string): Promise<string | null> {
  const actor = await resolveShopActor(clerkUserId)
  return actor?.clientId ?? null
}
