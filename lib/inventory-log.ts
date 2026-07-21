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
import { fireBackInStockAlerts } from './back-in-stock'

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

const ADJUSTMENT_SELECT = {
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
} satisfies Prisma.InventoryAdjustmentSelect

function toLogRow(r: Prisma.InventoryAdjustmentGetPayload<{ select: typeof ADJUSTMENT_SELECT }>): AdjustmentLogRow {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    delta: r.delta,
    reason: r.reason,
    note: r.note,
    productName: r.variant.product.name,
    dose: r.variant.dose,
    sku: r.variant.sku,
    by: (r.createdBy ? displayName(r.createdBy) : null) || r.createdByName || 'System',
  }
}

/** Recent inventory movements (newest first) for the Activity log. */
export async function listInventoryAdjustments(
  take = 200,
  variantId?: string
): Promise<AdjustmentLogRow[]> {
  if (!prisma) return []
  const rows = await prisma.inventoryAdjustment.findMany({
    where: variantId ? { variantId } : undefined,
    orderBy: { createdAt: 'desc' },
    take,
    select: ADJUSTMENT_SELECT,
  })
  return rows.map(toLogRow)
}

export interface ListAdjustmentsPagedFilters {
  page?: number
  pageSize?: number
  variantId?: string
  reason?: string
  search?: string
  from?: Date
  to?: Date
}

export interface PagedAdjustments {
  adjustments: AdjustmentLogRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * Server-driven Activity log: reason + date-range filters, free-text search
 * across product name / SKU / note / actor, and offset pagination. `total`
 * counts every row matching the filter so the client can render page controls.
 */
export async function listInventoryAdjustmentsPaged(
  filters: ListAdjustmentsPagedFilters = {}
): Promise<PagedAdjustments> {
  if (!prisma) return { adjustments: [], total: 0, page: 1, pageSize: filters.pageSize ?? 25 }

  const where: Prisma.InventoryAdjustmentWhereInput = {}
  if (filters.variantId) where.variantId = filters.variantId
  if (filters.reason) where.reason = filters.reason as Prisma.InventoryAdjustmentWhereInput['reason']
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  if (filters.search) {
    const q = filters.search
    where.OR = [
      { note: { contains: q, mode: 'insensitive' } },
      { createdByName: { contains: q, mode: 'insensitive' } },
      { variant: { sku: { contains: q, mode: 'insensitive' } } },
      { variant: { product: { name: { contains: q, mode: 'insensitive' } } } },
    ]
  }

  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(500, Math.max(1, filters.pageSize ?? 25))
  const [rows, total] = await Promise.all([
    prisma.inventoryAdjustment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: ADJUSTMENT_SELECT,
    }),
    prisma.inventoryAdjustment.count({ where }),
  ])
  return { adjustments: rows.map(toLogRow), total, page, pageSize }
}

export class AdjustmentError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'INVALID' = 'INVALID'
  ) {
    super(message)
    this.name = 'AdjustmentError'
  }
}

export interface ManualAdjustmentInput {
  variantId: string
  /** Signed quantity change; negative removes stock. */
  delta: number
  reason: 'MANUAL_ADJUSTMENT' | 'DAMAGE' | 'AUDIT' | 'RETURN'
  note?: string | null
}

/**
 * Record a manual stock correction (count fix, damage write-off, audit
 * true-up, return restock). Atomic: the decrement path uses a conditional
 * update (`inventoryOnHand >= |delta|`) so concurrent draws can never push
 * stock negative — if the guard misses, the whole transaction aborts.
 */
export async function createManualAdjustment(
  input: ManualAdjustmentInput,
  actor: { clerkUserId?: string | null; label?: string | null }
) {
  if (!prisma) throw new AdjustmentError('Database is not configured')
  const delta = Math.trunc(input.delta)
  if (!Number.isFinite(delta) || delta === 0) {
    throw new AdjustmentError('Adjustment quantity must be a non-zero integer')
  }

  const client = prisma
  const adjustment = await client.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({
      where: { id: input.variantId },
      select: { id: true, inventoryOnHand: true },
    })
    if (!variant) throw new AdjustmentError('Product variant not found', 'NOT_FOUND')

    if (delta < 0) {
      const updated = await tx.productVariant.updateMany({
        where: { id: input.variantId, inventoryOnHand: { gte: -delta } },
        data: { inventoryOnHand: { increment: delta } },
      })
      if (updated.count === 0) {
        throw new AdjustmentError(
          `Cannot remove ${-delta}: only ${variant.inventoryOnHand} on hand`,
          'INSUFFICIENT_STOCK'
        )
      }
    } else {
      await tx.productVariant.update({
        where: { id: input.variantId },
        data: { inventoryOnHand: { increment: delta } },
      })
    }

    const { userId, name } = await resolveInventoryActor(tx, actor.clerkUserId, actor.label)
    return tx.inventoryAdjustment.create({
      data: {
        variantId: input.variantId,
        delta,
        reason: input.reason,
        note: input.note?.trim() || null,
        createdById: userId,
        createdByName: name,
      },
    })
  })
  // Positive corrections can make an out-of-stock variant sellable again —
  // fire-and-forget the back-in-stock alert pass after commit.
  if (delta > 0) void fireBackInStockAlerts(input.variantId)
  return adjustment
}

/**
 * Update a variant's reorder threshold (the level at which it appears in the
 * Low Stock view and the low-stock cron alert).
 */
export async function setReorderLevel(variantId: string, reorderLevel: number) {
  if (!prisma) throw new AdjustmentError('Database is not configured')
  const level = Math.trunc(reorderLevel)
  if (!Number.isFinite(level) || level < 0) {
    throw new AdjustmentError('Reorder level must be a non-negative integer')
  }
  try {
    return await prisma.productVariant.update({
      where: { id: variantId },
      data: { reorderLevel: level },
      select: { id: true, reorderLevel: true },
    })
  } catch {
    throw new AdjustmentError('Product variant not found', 'NOT_FOUND')
  }
}
