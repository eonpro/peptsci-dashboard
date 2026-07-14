/**
 * Prisma-backed warehouse pick/pack fulfillment service.
 *
 * Composes the pure pick-list planner (lib/fulfillment/pick-list-core.ts) with
 * live order + inventory-batch data, and manages the OrderFulfillment lifecycle
 * (NOT_STARTED → PICKING → PICKED → PACKED). Physical stock consumption still
 * happens through the batch label-consume path (order labels PDF `?consume`);
 * this layer records who picked/packed, when, and the verified pack counts.
 *
 * @module lib/fulfillment/service
 */

import { Prisma, type FulfillmentStage } from '@prisma/client'
import { prisma } from '../prisma'
import { logger } from '../logger'
import {
  allocatableBatchesForVariants,
  minAllocatableBud,
  planAllocation,
  recordLabelsPrintedTx,
} from '../inventory-batches'
import type { BatchActor } from '../inventory-batches-core'
import { aggregateByVariant } from '../inventory/reservations-core'
import { closeReservationsTx } from '../inventory/reservations'
import { resolveInventoryActor } from '../inventory-log'
import {
  buildPickList,
  type PickableBatch,
  type PickList,
  type PickListItemInput,
} from './pick-list-core'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

export interface ConsumeResult {
  orderId: string
  alreadyConsumed: boolean
  draws: number
  units: number
  shortfall: number
  /** The exact batch draws applied (empty when alreadyConsumed). */
  drawList: Array<{ batchId: string; variantId: string; qty: number }>
}

/** AuditLog action recording the exact batch draws of an order consume. */
const CONSUME_DRAWS_ACTION = 'consume_draws'
const CONSUME_DRAWS_REVERSED_ACTION = 'consume_draws_reversed'

/**
 * Transactional core of {@link consumeOrderInventory} — composable into a
 * caller-owned transaction (e.g. FedEx label creation, so the label, the
 * SHIPPED flip, and the stock draw commit or roll back together).
 */
export async function consumeOrderInventoryTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  actor: BatchActor,
  opts: { requireFull?: boolean } = {}
): Promise<ConsumeResult> {
  const [consumedCount, activeCount] = await Promise.all([
    tx.inventoryReservation.count({ where: { orderId, status: 'CONSUMED' } }),
    tx.inventoryReservation.count({ where: { orderId, status: 'ACTIVE' } }),
  ])
  // Already fulfilled — nothing to draw again.
  if (consumedCount > 0 && activeCount === 0) {
    return { orderId, alreadyConsumed: true, draws: 0, units: 0, shortfall: 0, drawList: [] }
  }

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, items: { select: { variantId: true, quantity: true } } },
  })
  if (!order) throw new Error('Order not found')

  // Aggregate by variant so a variant on multiple lines is drawn once.
  const aggregated = aggregateByVariant(order.items)
  const variantIds = aggregated.map((a) => a.variantId)

  const batches = variantIds.length
    ? await tx.inventoryBatch.findMany({
        where: {
          variantId: { in: variantIds },
          status: 'RECEIVED',
          qtyOnHand: { gt: 0 },
          // Never draw from batches past their beyond-use date.
          bud: { gte: minAllocatableBud() },
        },
        orderBy: [{ bud: 'asc' }, { batchNumber: 'asc' }],
        select: { id: true, variantId: true, batchNumber: true, bud: true, qtyOnHand: true },
      })
    : []
  const byVariant = new Map<string, typeof batches>()
  for (const b of batches) {
    const list = byVariant.get(b.variantId)
    if (list) list.push(b)
    else byVariant.set(b.variantId, [b])
  }

  // Plan every line first so we can enforce all-or-nothing before drawing.
  let shortfall = 0
  const plans = aggregated.map((a) => {
    const plan = planAllocation(byVariant.get(a.variantId) ?? [], a.quantity)
    shortfall += plan.shortfall
    return plan
  })
  if (opts.requireFull && shortfall > 0) {
    throw new InsufficientBatchStockError()
  }

  let draws = 0
  let units = 0
  const drawLog: Array<{ batchId: string; variantId: string; qty: number }> = []
  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i]
    for (const d of plan.draws) {
      await recordLabelsPrintedTx(tx, d.batchId, d.qty, actor)
      drawLog.push({ batchId: d.batchId, variantId: aggregated[i].variantId, qty: d.qty })
      draws += 1
      units += d.qty
    }
  }

  await closeReservationsTx(tx, orderId, 'CONSUMED')

  // Persist the exact draws so a label void can reverse the consume precisely.
  if (drawLog.length > 0) {
    await tx.auditLog.create({
      data: {
        entity: 'Order',
        entityId: orderId,
        action: CONSUME_DRAWS_ACTION,
        orderId,
        metadata: { draws: drawLog } as unknown as Prisma.InputJsonValue,
      },
    })
  }

  return { orderId, alreadyConsumed: false, draws, units, shortfall, drawList: drawLog }
}

/** Thrown when `requireFull` consume cannot fully allocate from batches. */
export class InsufficientBatchStockError extends Error {
  readonly code = 'INSUFFICIENT_BATCH_STOCK'
  constructor(message = 'Insufficient batch stock to fulfill this order') {
    super(message)
    this.name = 'InsufficientBatchStockError'
  }
}

/**
 * Consume an order's inventory exactly once: draw its lines from batches FIFO
 * (atomic per-batch decrement) and move the order's ACTIVE reservations to
 * CONSUMED — all in a single transaction so on-hand and the reserved counter
 * never drift (fixes the "stock consumed but reservations left" and
 * "shipped without decrement" gaps). Idempotent: if the order was already
 * consumed (has CONSUMED reservations and no ACTIVE ones) it is a no-op, so a
 * second labels-consume or a FedEx label after a labels-consume won't double
 * draw stock.
 *
 * When `requireFull` is true, an inability to fully allocate aborts the whole
 * consume (nothing is drawn) so we never partially fulfill.
 */
export async function consumeOrderInventory(
  orderId: string,
  actor: BatchActor,
  opts: { requireFull?: boolean } = {}
): Promise<ConsumeResult> {
  const client = db()
  const result = await client.$transaction((tx) => consumeOrderInventoryTx(tx, orderId, actor, opts))
  logger.info('Consumed order inventory', { ...result })
  return result
}

export interface ReverseConsumeResult {
  orderId: string
  reversed: boolean
  units: number
}

/**
 * Reverse the most recent (un-reversed) consume for an order: restore each
 * recorded batch draw (batch qtyOnHand + variant on-hand + audit trail) and
 * re-open the order's CONSUMED reservations. Used when a shipping label is
 * voided before the goods actually left. Idempotent: the consume-draws marker
 * is atomically claimed, so a double-void reverses at most once.
 */
export async function reverseOrderConsume(
  orderId: string,
  actor: BatchActor
): Promise<ReverseConsumeResult> {
  const client = db()
  const result = await client.$transaction(async (tx) => {
    const marker = await tx.auditLog.findFirst({
      where: { entity: 'Order', entityId: orderId, action: CONSUME_DRAWS_ACTION },
      orderBy: { createdAt: 'desc' },
    })
    if (!marker) return { orderId, reversed: false, units: 0 }

    // Atomic claim so concurrent voids can't double-restore.
    const claim = await tx.auditLog.updateMany({
      where: { id: marker.id, action: CONSUME_DRAWS_ACTION },
      data: { action: CONSUME_DRAWS_REVERSED_ACTION },
    })
    if (claim.count === 0) return { orderId, reversed: false, units: 0 }

    const meta = marker.metadata as { draws?: Array<{ batchId: string; variantId: string; qty: number }> } | null
    const draws = meta?.draws ?? []
    const { userId: actorUserId, name: actorName } = await resolveInventoryActor(
      tx,
      actor.clerkUserId,
      actor.label
    )

    let units = 0
    for (const d of draws) {
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: d.batchId },
        select: { id: true, batchNumber: true, status: true, qtyOnHand: true, variantId: true },
      })
      if (!batch || batch.status === 'VOIDED') {
        logger.warn('Skipping consume reversal for missing/voided batch', {
          orderId,
          batchId: d.batchId,
        })
        continue
      }
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          qtyOnHand: { increment: d.qty },
          ...(batch.status === 'DEPLETED' ? { status: 'RECEIVED' as const } : {}),
          events: {
            create: {
              type: 'ADJUSTED',
              delta: d.qty,
              note: 'Label voided — consume reversed',
              performedBy: actorName ?? actor.label ?? null,
            },
          },
        },
      })
      await tx.productVariant.update({
        where: { id: batch.variantId },
        data: { inventoryOnHand: { increment: d.qty } },
      })
      await tx.inventoryAdjustment.create({
        data: {
          variantId: batch.variantId,
          delta: d.qty,
          reason: 'MANUAL_ADJUSTMENT',
          note: `Label void reversal for batch ${batch.batchNumber}`,
          orderId,
          createdById: actorUserId,
          createdByName: actorName,
        },
      })
      units += d.qty
    }

    // Re-open the order's reservations so availability math reflects the
    // still-committed (unshipped) order.
    const consumed = await tx.inventoryReservation.findMany({
      where: { orderId, status: 'CONSUMED' },
      select: { id: true, variantId: true, quantity: true },
    })
    for (const r of consumed) {
      const res = await tx.inventoryReservation.updateMany({
        where: { id: r.id, status: 'CONSUMED' },
        data: { status: 'ACTIVE', consumedAt: null },
      })
      if (res.count === 1) {
        await tx.productVariant.update({
          where: { id: r.variantId },
          data: { inventoryReserved: { increment: r.quantity } },
        })
      }
    }

    return { orderId, reversed: true, units }
  })

  if (result.reversed) logger.info('Reversed order consume', result)
  return result
}

export interface OrderPickList extends PickList {
  orderId: string
  orderNumber: number
  clientName: string | null
  createdAt: string
}

export interface PackingSlipData {
  orderId: string
  orderNumber: number
  createdAt: string
  carrier: string | null
  trackingNumber: string | null
  client: {
    organizationName: string | null
    contactName: string | null
    contactPhone: string | null
  } | null
  shippingAddress: unknown
  lines: Array<{ productName: string; dose: string; sku: string; quantity: number }>
  totalUnits: number
}

const ORDER_WITH_ITEMS = {
  items: {
    include: {
      variant: { include: { product: { select: { name: true } } } },
    },
  },
  client: {
    select: { organizationName: true, contactName: true, contactPhone: true },
  },
} satisfies Prisma.OrderInclude

function toPickListItems(
  items: Array<{
    variantId: string
    quantity: number
    variant: { sku: string | null; dose: string | null; product: { name: string } }
  }>
): PickListItemInput[] {
  return items.map((it) => ({
    variantId: it.variantId,
    productName: it.variant.product.name,
    dose: it.variant.dose,
    sku: it.variant.sku,
    quantity: it.quantity,
  }))
}

/** Build a FIFO pick list for an order. Throws if the order is missing. */
export async function buildOrderPickList(orderId: string): Promise<OrderPickList> {
  const order = await db().order.findUnique({
    where: { id: orderId },
    include: ORDER_WITH_ITEMS,
  })
  if (!order) throw new Error('Order not found')

  const items = toPickListItems(order.items)
  const batchRows = await allocatableBatchesForVariants(items.map((i) => i.variantId))

  const batchesByVariant = new Map<string, PickableBatch[]>()
  for (const [variantId, rows] of batchRows.entries()) {
    batchesByVariant.set(
      variantId,
      rows.map((r) => ({ batchNumber: r.batchNumber, bud: r.bud, qtyOnHand: r.qtyOnHand }))
    )
  }

  const pickList = buildPickList(items, batchesByVariant)
  return {
    ...pickList,
    orderId: order.id,
    orderNumber: order.orderNumber,
    clientName: order.client?.organizationName ?? null,
    createdAt: order.createdAt.toISOString(),
  }
}

/** Assemble the data needed to render a packing slip. Throws if missing. */
export async function buildPackingSlipData(orderId: string): Promise<PackingSlipData> {
  const order = await db().order.findUnique({
    where: { id: orderId },
    include: ORDER_WITH_ITEMS,
  })
  if (!order) throw new Error('Order not found')

  const lines = order.items.map((it) => ({
    productName: it.variant.product.name,
    dose: it.variant.dose ?? '',
    sku: it.variant.sku ?? '',
    quantity: it.quantity,
  }))

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    client: order.client,
    shippingAddress: order.shippingAddress,
    lines,
    totalUnits: lines.reduce((s, l) => s + l.quantity, 0),
  }
}

export interface VerifiedItem {
  variantId: string
  productName: string
  expected: number
  packed: number
}

export type FulfillmentAction = 'pick' | 'pack' | 'reset'

/** Current fulfillment row for an order, or null if none yet. */
export async function getOrderFulfillment(orderId: string) {
  return db().orderFulfillment.findUnique({ where: { orderId } })
}

/**
 * Advance an order's fulfillment lifecycle. `pick` marks it picked, `pack`
 * records the verified counts and marks it packed, `reset` clears progress.
 * Idempotent per stage; safe to call repeatedly.
 */
export async function advanceFulfillment(
  orderId: string,
  action: FulfillmentAction,
  userId: string,
  verifiedItems?: VerifiedItem[]
) {
  const client = db()
  const order = await client.order.findUnique({ where: { id: orderId }, select: { id: true } })
  if (!order) throw new Error('Order not found')

  const now = new Date()
  let stage: FulfillmentStage
  const data: Prisma.OrderFulfillmentUncheckedUpdateInput = {}

  if (action === 'pick') {
    stage = 'PICKED'
    data.stage = 'PICKED'
    data.pickedAt = now
    data.pickedById = userId
  } else if (action === 'pack') {
    stage = 'PACKED'
    data.stage = 'PACKED'
    data.packedAt = now
    data.packedById = userId
    if (verifiedItems) data.verifiedItems = verifiedItems as unknown as Prisma.InputJsonValue
  } else {
    stage = 'NOT_STARTED'
    data.stage = 'NOT_STARTED'
    data.pickedAt = null
    data.pickedById = null
    data.packedAt = null
    data.packedById = null
    data.verifiedItems = Prisma.JsonNull
  }

  return client.orderFulfillment.upsert({
    where: { orderId },
    create: {
      orderId,
      stage,
      ...(action === 'pick' ? { pickedAt: now, pickedById: userId } : {}),
      ...(action === 'pack'
        ? {
            packedAt: now,
            packedById: userId,
            ...(verifiedItems
              ? { verifiedItems: verifiedItems as unknown as Prisma.InputJsonValue }
              : {}),
          }
        : {}),
    },
    update: data,
  })
}
