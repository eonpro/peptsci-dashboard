/**
 * Returns/RMA service (Prisma-backed).
 *
 * Opens RMAs against an Order, advances them through the status workflow
 * (validated by lib/returns/core), and restocks received GOOD items back into
 * inventory — bumping ProductVariant.inventoryOnHand and writing an
 * InventoryAdjustment (reason RETURN) for the audit trail. Admins are notified
 * on key transitions.
 *
 * Server-only.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveInventoryActor } from '@/lib/inventory-log'
import type { Prisma, ReturnRequest, ReturnStatus } from '@prisma/client'
import { notifyAdmins } from '@/lib/notifications/service'
import {
  canTransition,
  formatRmaNumber,
  isRestockEligible,
  type ReturnItemCondition,
} from './core'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

const RMA_MAX_ATTEMPTS = 8

export interface CreateReturnItemInput {
  orderItemId?: string | null
  variantId?: string | null
  productName: string
  quantity: number
  condition?: ReturnItemCondition
  notes?: string | null
}

export interface CreateReturnInput {
  orderId: string
  reason?: string | null
  notes?: string | null
  requestedById?: string | null
  items: CreateReturnItemInput[]
}

/** Generate a unique RMA number for today, retrying on the unique constraint. */
async function nextRmaNumber(client = db()): Promise<string> {
  const now = new Date()
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const countToday = await client.returnRequest.count({
    where: { createdAt: { gte: startOfDay } },
  })
  return formatRmaNumber(now, countToday + 1)
}

export async function createReturnRequest(input: CreateReturnInput): Promise<ReturnRequest> {
  const client = db()

  if (!input.items || input.items.length === 0) {
    throw new Error('A return must include at least one item')
  }
  for (const item of input.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error(`Invalid quantity for "${item.productName}"`)
    }
  }

  const order = await client.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, clientId: true, orderNumber: true },
  })
  if (!order) throw new Error('Order not found')

  // Retry to absorb the (rare) race on the per-day RMA sequence.
  for (let attempt = 1; attempt <= RMA_MAX_ATTEMPTS; attempt++) {
    const rmaNumber = await nextRmaNumber(client)
    try {
      const created = await client.returnRequest.create({
        data: {
          rmaNumber,
          orderId: order.id,
          clientId: order.clientId,
          reason: input.reason ?? undefined,
          notes: input.notes ?? undefined,
          requestedById: input.requestedById ?? undefined,
          items: {
            create: input.items.map((it) => ({
              orderItemId: it.orderItemId ?? undefined,
              variantId: it.variantId ?? undefined,
              productName: it.productName,
              quantity: Math.floor(it.quantity),
              condition: it.condition ?? 'GOOD',
              notes: it.notes ?? undefined,
            })),
          },
        },
        include: { items: true },
      })

      await notifyAdmins({
        category: 'ORDER',
        priority: 'NORMAL',
        title: `Return opened: ${rmaNumber}`,
        message: `A return was opened for order #${order.orderNumber} (${created.items.length} item(s)).`,
        actionUrl: `/returns/${created.id}`,
        metadata: { returnId: created.id, rmaNumber, orderId: order.id, orderNumber: order.orderNumber },
        sourceType: 'return:created',
        sourceId: created.id,
      }).catch(() => {})

      logger.info('Return request created', { returnId: created.id, rmaNumber, orderId: order.id })
      return created
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const isUniqueClash =
        message.includes('Unique constraint') || message.includes('rmaNumber')
      if (isUniqueClash && attempt < RMA_MAX_ATTEMPTS) continue
      throw err
    }
  }

  throw new Error('Could not allocate a unique RMA number')
}

/** Timestamps to stamp when entering certain states. */
function statusTimestamps(to: ReturnStatus): Prisma.ReturnRequestUpdateInput {
  const now = new Date()
  switch (to) {
    case 'APPROVED':
      return { approvedAt: now }
    case 'RECEIVED':
      return { receivedAt: now }
    case 'CLOSED':
    case 'REJECTED':
      return { closedAt: now }
    default:
      return {}
  }
}

export interface UpdateReturnStatusInput {
  refundAmount?: number | null
  notes?: string | null
  actorId?: string | null
}

export async function updateReturnStatus(
  id: string,
  to: ReturnStatus,
  opts: UpdateReturnStatusInput = {}
): Promise<ReturnRequest> {
  const client = db()
  const current = await client.returnRequest.findUnique({
    where: { id },
    select: { id: true, status: true, rmaNumber: true, orderId: true },
  })
  if (!current) throw new Error('Return not found')

  if (!canTransition(current.status, to)) {
    throw new Error(`Cannot move return from ${current.status} to ${to}`)
  }

  const updated = await client.returnRequest.update({
    where: { id },
    data: {
      status: to,
      ...(opts.notes !== undefined ? { notes: opts.notes ?? undefined } : {}),
      ...(opts.refundAmount !== undefined && opts.refundAmount !== null
        ? { refundAmount: opts.refundAmount }
        : {}),
      ...statusTimestamps(to),
    },
    include: { items: true },
  })

  logger.info('Return status updated', {
    returnId: id,
    from: current.status,
    to,
    by: opts.actorId ?? undefined,
  })

  return updated
}

export interface RestockResult {
  returnId: string
  restocked: number
  totalUnits: number
  skipped: number
}

/**
 * Restock all eligible (GOOD, not-yet-restocked) items on a received/inspected
 * return. Each restock bumps the variant's on-hand count and writes an
 * InventoryAdjustment (reason RETURN). Idempotent: already-restocked items are
 * skipped. When everything eligible is restocked, the request advances to
 * RESTOCKED (if the transition is allowed).
 */
export async function restockReturnItems(
  id: string,
  actorId?: string | null
): Promise<RestockResult> {
  const client = db()

  const request = await client.returnRequest.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!request) throw new Error('Return not found')

  const eligible = request.items.filter((it) =>
    isRestockEligible({
      status: request.status,
      condition: it.condition,
      restocked: it.restocked,
    })
  )

  let restocked = 0
  let totalUnits = 0

  for (const item of eligible) {
    if (!item.variantId) {
      // No variant link → can't safely restock; leave it for manual handling.
      continue
    }
    const variantId = item.variantId
    // Atomic claim: only proceed if THIS call flips restocked false→true. A
    // concurrent restock (double-click / two tabs) that already flipped it
    // affects 0 rows here and is skipped, so on-hand is never double-incremented.
    const applied = await client.$transaction(async (tx) => {
      const claim = await tx.returnItem.updateMany({
        where: { id: item.id, restocked: false },
        data: { restocked: true },
      })
      if (claim.count === 0) return false
      await tx.productVariant.update({
        where: { id: variantId },
        data: { inventoryOnHand: { increment: item.quantity } },
      })
      // actorId is a CLERK id — resolve it to the internal User row (passing it
      // straight into createdById would violate the FK and abort the restock).
      const actor = await resolveInventoryActor(tx, actorId)
      await tx.inventoryAdjustment.create({
        data: {
          variantId,
          delta: item.quantity,
          reason: 'RETURN',
          note: `Return ${request.rmaNumber} restock`,
          orderId: request.orderId,
          createdById: actor.userId,
          createdByName: actor.name,
        },
      })
      return true
    })
    if (applied) {
      restocked += 1
      totalUnits += item.quantity
    }
  }

  const skipped = eligible.length - restocked

  // Advance the request to RESTOCKED when we restocked something and the
  // transition is valid from the current state.
  if (restocked > 0 && canTransition(request.status, 'RESTOCKED')) {
    await client.returnRequest
      .update({ where: { id }, data: { status: 'RESTOCKED' } })
      .catch(() => {})
  }

  logger.info('Return items restocked', { returnId: id, restocked, totalUnits, skipped })
  return { returnId: id, restocked, totalUnits, skipped }
}

export interface ListReturnsFilters {
  status?: ReturnStatus
  orderId?: string
  clientId?: string
}

export async function listReturnRequests(
  filters: ListReturnsFilters = {},
  page = 1,
  pageSize = 50
) {
  const client = db()
  const take = Math.min(Math.max(pageSize, 1), 200)
  const skip = (Math.max(page, 1) - 1) * take

  const where: Prisma.ReturnRequestWhereInput = {
    ...(filters.status && { status: filters.status }),
    ...(filters.orderId && { orderId: filters.orderId }),
    ...(filters.clientId && { clientId: filters.clientId }),
  }

  const [returns, total] = await Promise.all([
    client.returnRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        items: true,
        order: { select: { orderNumber: true } },
        client: { select: { organizationName: true } },
      },
    }),
    client.returnRequest.count({ where }),
  ])

  return { returns, total, page: Math.max(page, 1), pageSize: take }
}

export async function getReturnRequest(id: string) {
  return db().returnRequest.findUnique({
    where: { id },
    include: {
      items: true,
      order: { select: { id: true, orderNumber: true } },
      client: { select: { id: true, organizationName: true, contactEmail: true } },
    },
  })
}
