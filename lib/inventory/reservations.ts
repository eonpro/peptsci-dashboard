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
async function closeReservations(
  orderId: string,
  to: 'RELEASED' | 'CONSUMED'
): Promise<ReservationCloseResult> {
  const client = db()
  const active = await client.inventoryReservation.findMany({
    where: { orderId, status: 'ACTIVE' },
    select: { id: true, variantId: true, quantity: true },
  })

  let units = 0
  const stamp = to === 'RELEASED' ? { releasedAt: new Date() } : { consumedAt: new Date() }

  for (const r of active) {
    await client.$transaction(async (tx) => {
      await tx.inventoryReservation.update({
        where: { id: r.id },
        data: { status: to, ...stamp },
      })
      await tx.productVariant.update({
        where: { id: r.variantId },
        data: { inventoryReserved: { decrement: r.quantity } },
      })
    })
    units += r.quantity
  }

  logger.info('Closed reservations for order', { orderId, to, affected: active.length, units })
  return { orderId, affected: active.length, units }
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
