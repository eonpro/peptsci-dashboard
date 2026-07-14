/**
 * Inventory reservation service (Prisma-backed).
 *
 * Reserving an order's lines increments ProductVariant.inventoryReserved without
 * touching on-hand, so availability for new orders is
 * (inventoryOnHand - inventoryReserved). Lifecycle:
 *   - reserve  at order submit/capture (B2B) or creation (storefront)
 *   - release  on cancel / refund (frees reserved)
 *   - consume  at fulfillment (frees reserved; on-hand is decremented separately
 *              by the batch consume in lib/inventory-batches)
 *
 * Reservation is non-blocking by default: it reserves even if that drives
 * availability negative (oversell), surfaced via availableQty()/isOversold().
 * Use canReserve() to enforce hard stock limits where desired.
 *
 * All counter mutations run inside a transaction so the reserved counter and the
 * reservation rows never drift. Every operation is idempotent.
 *
 * Server-only.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { aggregateByVariant, availableQty } from './reservations-core'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

export interface ReserveResult {
  orderId: string
  reservedVariants: number
  reservedUnits: number
  skipped: number
}

/** Thrown by enforced reservation when a line exceeds sellable stock. */
export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK'
  constructor(message = 'Insufficient stock to reserve this order') {
    super(message)
    this.name = 'InsufficientStockError'
  }
}

/**
 * Transactional reservation of all of an order's lines. Idempotent per
 * variant (existing rows for this order are skipped). With `enforce`, each
 * increment is an ATOMIC conditional update (`onHand − reserved >= qty` in
 * the WHERE clause) so two concurrent checkouts can never both reserve the
 * last units — the loser's update affects 0 rows, InsufficientStockError is
 * thrown, and the surrounding transaction rolls back every line.
 */
export async function reserveForOrderTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  opts: { enforce?: boolean } = {}
): Promise<ReserveResult> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, items: { select: { id: true, variantId: true, quantity: true } } },
  })
  if (!order) throw new Error('Order not found')

  const aggregated = aggregateByVariant(order.items)
  const itemByVariant = new Map<string, string>()
  for (const it of order.items) {
    if (!itemByVariant.has(it.variantId)) itemByVariant.set(it.variantId, it.id)
  }

  const existing = await tx.inventoryReservation.findMany({
    where: { orderId },
    select: { variantId: true },
  })
  const alreadyReserved = new Set(existing.map((r) => r.variantId))

  let reservedVariants = 0
  let reservedUnits = 0
  let skipped = 0

  for (const line of aggregated) {
    if (alreadyReserved.has(line.variantId)) {
      skipped += 1
      continue
    }
    await tx.inventoryReservation.create({
      data: {
        orderId,
        variantId: line.variantId,
        orderItemId: itemByVariant.get(line.variantId) ?? null,
        quantity: line.quantity,
        status: 'ACTIVE',
      },
    })
    if (opts.enforce) {
      const updated = await tx.$executeRaw`
        UPDATE "ProductVariant"
        SET "inventoryReserved" = "inventoryReserved" + ${line.quantity}
        WHERE "id" = ${line.variantId}
          AND "inventoryOnHand" - "inventoryReserved" >= ${line.quantity}`
      if (updated === 0) {
        throw new InsufficientStockError()
      }
    } else {
      await tx.productVariant.update({
        where: { id: line.variantId },
        data: { inventoryReserved: { increment: line.quantity } },
      })
    }
    reservedVariants += 1
    reservedUnits += line.quantity
  }

  return { orderId, reservedVariants, reservedUnits, skipped }
}

/**
 * Reserve an order's lines in a single transaction, hard-failing (and rolling
 * everything back) when any line exceeds sellable stock. Used by checkout
 * paths when CHECKOUT_ENFORCE_STOCK is on.
 */
export async function reserveForOrderEnforced(orderId: string): Promise<ReserveResult> {
  const client = db()
  const result = await client.$transaction((tx) => reserveForOrderTx(tx, orderId, { enforce: true }))
  logger.info('Reserved inventory for order (enforced)', { ...result })
  return result
}

/**
 * Release ACTIVE reservations held by stale, never-paid DRAFT orders (abandoned
 * checkouts). Keeps enforced checkout from being starved by carts that reserved
 * stock but never completed payment. Returns released units.
 */
export async function releaseStaleDraftReservations(
  olderThanMs = 45 * 60 * 1000
): Promise<number> {
  const client = db()
  const stale = await client.order.findMany({
    where: {
      status: 'DRAFT',
      paymentStatus: { in: ['PENDING', 'FAILED'] },
      createdAt: { lt: new Date(Date.now() - olderThanMs) },
      reservations: { some: { status: 'ACTIVE' } },
    },
    select: { id: true },
    take: 100,
  })
  let released = 0
  for (const o of stale) {
    const r = await releaseForOrder(o.id)
    released += r.units
  }
  if (released > 0) {
    logger.info('Released stale draft reservations', { orders: stale.length, units: released })
  }
  return released
}

/**
 * Reserve all of an order's lines. Idempotent: a variant that already has a
 * reservation row for this order (in any state) is skipped, so re-running on
 * webhook + confirm never double-counts.
 */
export async function reserveForOrder(orderId: string): Promise<ReserveResult> {
  const client = db()

  const order = await client.order.findUnique({
    where: { id: orderId },
    select: { id: true, items: { select: { id: true, variantId: true, quantity: true } } },
  })
  if (!order) throw new Error('Order not found')

  const aggregated = aggregateByVariant(order.items)
  // Map each aggregated variant back to a representative orderItemId for display.
  const itemByVariant = new Map<string, string>()
  for (const it of order.items) {
    if (!itemByVariant.has(it.variantId)) itemByVariant.set(it.variantId, it.id)
  }

  const existing = await client.inventoryReservation.findMany({
    where: { orderId },
    select: { variantId: true },
  })
  const alreadyReserved = new Set(existing.map((r) => r.variantId))

  let reservedVariants = 0
  let reservedUnits = 0
  let skipped = 0

  for (const line of aggregated) {
    if (alreadyReserved.has(line.variantId)) {
      skipped += 1
      continue
    }
    try {
      await client.$transaction(async (tx) => {
        await tx.inventoryReservation.create({
          data: {
            orderId,
            variantId: line.variantId,
            orderItemId: itemByVariant.get(line.variantId) ?? null,
            quantity: line.quantity,
            status: 'ACTIVE',
          },
        })
        await tx.productVariant.update({
          where: { id: line.variantId },
          data: { inventoryReserved: { increment: line.quantity } },
        })
      })
      reservedVariants += 1
      reservedUnits += line.quantity
    } catch (err) {
      // Unique (orderId, variantId) clash → another path reserved it; treat as skip.
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('Unique constraint') || message.includes('orderId_variantId')) {
        skipped += 1
        continue
      }
      throw err
    }
  }

  logger.info('Reserved inventory for order', { orderId, reservedVariants, reservedUnits, skipped })
  return { orderId, reservedVariants, reservedUnits, skipped }
}

export interface ReservationCloseResult {
  orderId: string
  affected: number
  units: number
}

/**
 * Move all ACTIVE reservations for an order to a terminal state, decrementing the
 * reserved counter by each. `consume` frees reserved at fulfillment (on-hand is
 * dropped by the batch consume); `release` frees reserved on cancel/refund.
 */
/**
 * Transactional core of {@link closeReservations}. Each reservation is moved to
 * its terminal state with a `status: 'ACTIVE'` guard in the WHERE clause so a
 * concurrent release+consume (e.g. a refund webhook racing a labels consume)
 * can only decrement the reserved counter ONCE — whichever path wins the
 * compare-and-swap. The loser's update affects 0 rows and skips the decrement,
 * so `inventoryReserved` never goes negative.
 */
export async function closeReservationsTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  to: 'RELEASED' | 'CONSUMED'
): Promise<ReservationCloseResult> {
  const active = await tx.inventoryReservation.findMany({
    where: { orderId, status: 'ACTIVE' },
    select: { id: true, variantId: true, quantity: true },
  })

  let units = 0
  let affected = 0
  const stamp = to === 'RELEASED' ? { releasedAt: new Date() } : { consumedAt: new Date() }

  for (const r of active) {
    const res = await tx.inventoryReservation.updateMany({
      where: { id: r.id, status: 'ACTIVE' },
      data: { status: to, ...stamp },
    })
    if (res.count === 1) {
      await tx.productVariant.update({
        where: { id: r.variantId },
        data: { inventoryReserved: { decrement: r.quantity } },
      })
      units += r.quantity
      affected += 1
    }
  }

  return { orderId, affected, units }
}

async function closeReservations(
  orderId: string,
  to: 'RELEASED' | 'CONSUMED'
): Promise<ReservationCloseResult> {
  const client = db()
  const result = await client.$transaction((tx) => closeReservationsTx(tx, orderId, to))
  logger.info('Closed reservations for order', {
    orderId,
    to,
    affected: result.affected,
    units: result.units,
  })
  return result
}

export function releaseForOrder(orderId: string): Promise<ReservationCloseResult> {
  return closeReservations(orderId, 'RELEASED')
}

export function consumeForOrder(orderId: string): Promise<ReservationCloseResult> {
  return closeReservations(orderId, 'CONSUMED')
}

export interface VariantAvailability {
  variantId: string
  onHand: number
  reserved: number
  available: number
}

export async function getVariantAvailability(variantId: string): Promise<VariantAvailability | null> {
  const v = await db().productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, inventoryOnHand: true, inventoryReserved: true },
  })
  if (!v) return null
  return {
    variantId: v.id,
    onHand: v.inventoryOnHand,
    reserved: v.inventoryReserved,
    available: availableQty(v.inventoryOnHand, v.inventoryReserved),
  }
}

export async function getOrderReservations(orderId: string) {
  return db().inventoryReservation.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
    include: {
      variant: { select: { sku: true, dose: true, product: { select: { name: true } } } },
    },
  })
}

export async function listActiveReservations(variantId?: string) {
  return db().inventoryReservation.findMany({
    where: { status: 'ACTIVE', ...(variantId ? { variantId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      order: { select: { orderNumber: true } },
      variant: { select: { sku: true, dose: true, product: { select: { name: true } } } },
    },
  })
}
