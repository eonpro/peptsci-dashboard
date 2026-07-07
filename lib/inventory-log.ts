/**
 * Inventory movement log helpers.
 *
 * Every change to on-hand stock is recorded as an InventoryAdjustment with the
 * acting user attached (User row when one exists, display-name fallback
 * otherwise). This module centralizes actor resolution and the read side used
 * by the Inventory page's Activity tab.
 */

import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export interface InventoryActor {
  /** Internal User.id (cuid) or null when the Clerk id has no User row. */
  userId: string | null
  /** Human-readable actor label for display/audit fallback. */
  name: string | null
}

function displayName(user: {
  firstName: string | null
  lastName: string | null
  email: string | null
  clerkUserId: string
}): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return full || user.email || user.clerkUserId
}

/**
 * Resolve a Clerk user id to the internal User id + a display name, using any
 * Prisma client (pass a transaction client to resolve inside a transaction).
 */
export async function resolveInventoryActor(
  client: Prisma.TransactionClient,
  clerkUserId: string | null | undefined,
  fallbackLabel?: string | null
): Promise<InventoryActor> {
  if (clerkUserId && clerkUserId !== 'dev-user') {
    const user = await client.user.findUnique({
      where: { clerkUserId },
      select: { id: true, firstName: true, lastName: true, email: true, clerkUserId: true },
    })
    if (user) return { userId: user.id, name: displayName(user) }
  }
  return { userId: null, name: fallbackLabel?.trim() || clerkUserId || null }
}

export interface AdjustmentLogRow {
  id: string
  createdAt: string
  delta: number
  reason: string
  note: string | null
  productName: string
  dose: string | null
  sku: string | null
  by: string
}

/** Recent inventory movements (newest first) for the Activity log. */
export async function listInventoryAdjustments(take = 200): Promise<AdjustmentLogRow[]> {
  if (!prisma) return []
  const rows = await prisma.inventoryAdjustment.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      createdAt: true,
      delta: true,
      reason: true,
      note: true,
      createdByName: true,
      createdBy: {
        select: { firstName: true, lastName: true, email: true, clerkUserId: true },
      },
      variant: {
        select: { sku: true, dose: true, product: { select: { name: true } } },
      },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    delta: r.delta,
    reason: r.reason,
    note: r.note,
    productName: r.variant.product.name,
    dose: r.variant.dose,
    sku: r.variant.sku,
    by: (r.createdBy ? displayName(r.createdBy) : null) || r.createdByName || 'System',
  }))
}
