/**
 * Inventory Batch service
 * =======================
 *
 * Single-step intake workflow for PeptSci inventory:
 *   - Staff record an inbound receipt (product, dose, vial size, BUD, amount).
 *   - The batch number + Code128 barcode payload are auto-generated and frozen.
 *   - The receipt atomically: creates the InventoryBatch, increments the
 *     ProductVariant on-hand count, writes an InventoryAdjustment (RECEIPT) and
 *     an InventoryBatchEvent (RECEIVED).
 *
 * Postgres is the source of truth for on-hand stock. Each transition is wrapped
 * in a DB transaction so concurrent operators cannot corrupt counts, and the
 * batch-number collision suffix is applied with a bounded create-retry loop.
 *
 * Pure, DB-free helpers (validation + FIFO allocation planning) are exported so
 * they can be unit-tested without a database.
 *
 * @module lib/inventory-batches
 */

import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  buildBatchNumber,
  withCollisionSuffix,
  parseBudParts,
  type BatchNumberInput,
} from './batch-number'
import {
  validateCreateInput,
  BatchValidationError,
  type BatchActor,
  type CreateBatchInput,
} from './inventory-batches-core'
import { fireBackInStockAlerts } from './back-in-stock'
import {
  expiringWindow,
  type BatchScope,
  type BatchSortKey,
  type SortDir,
} from './inventory-workspace-core'
import { resolveInventoryActor } from './inventory-log'

// Re-export the pure helpers so callers can import everything from one module.
export {
  validateCreateInput,
  planAllocation,
  BatchValidationError,
} from './inventory-batches-core'
export type {
  BatchActor,
  CreateBatchInput,
  AllocatableBatch,
  AllocationDraw,
  AllocationPlan,
} from './inventory-batches-core'

const MAX_BATCH_NUMBER_ATTEMPTS = 50

function db() {
  if (!prisma) {
    throw new Error('Database is not configured')
  }
  return prisma
}

function normalizeDateOnly(value: string): Date {
  const { year, month, day } = parseBudParts(value)
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`)
}

function slugifySku(name: string, dose: string): string {
  const base = `${name}-${dose}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'PRODUCT'
}

/**
 * Resolve the DB User.id + display name for an actor's Clerk id. Prefers the
 * User row's real name over the raw label (routes often pass the Clerk id as
 * the label).
 */
async function resolveActor(actor: BatchActor) {
  return resolveInventoryActor(db(), actor.clerkUserId, actor.label)
}

/**
 * Find or create the ProductVariant a batch attaches to. When `variantId` is
 * given it is used directly; otherwise the product (by name) and variant (by
 * name+dose) are upserted so brand-new products like "Tesamorelin" can be
 * received without a prior catalog entry.
 */
async function resolveVariant(input: CreateBatchInput): Promise<{
  variantId: string
  productName: string
  dose: string
  vialSize: string | null
}> {
  const client = db()
  if (input.variantId) {
    const variant = await client.productVariant.findUnique({
      where: { id: input.variantId },
      include: { product: { select: { name: true } } },
    })
    if (!variant) throw new BatchValidationError('Selected product variant was not found', 'variantId')
    return {
      variantId: variant.id,
      productName: input.name?.trim() || variant.product.name,
      dose: input.dose?.trim() || variant.dose || '',
      vialSize: input.vialSize?.trim() || variant.unitSize || null,
    }
  }

  const name = input.name!.trim()
  const dose = input.dose!.trim()
  const vialSize = input.vialSize?.trim() || null

  const product = await client.product.upsert({
    where: { sku: slugifySku(name, '') },
    update: {},
    create: { name, sku: slugifySku(name, ''), status: 'ACTIVE' },
  })

  // Match an existing variant for this product + dose, else create one.
  const existing = await client.productVariant.findFirst({
    where: { productId: product.id, dose },
  })
  if (existing) {
    return { variantId: existing.id, productName: name, dose, vialSize: vialSize ?? existing.unitSize ?? null }
  }

  const created = await client.productVariant.create({
    data: {
      productId: product.id,
      sku: slugifySku(name, dose),
      dose,
      unitSize: vialSize,
      unitCost: 0,
      srp: 0,
      inventoryOnHand: 0,
      status: 'ACTIVE',
    },
  })
  return { variantId: created.id, productName: name, dose, vialSize }
}

/**
 * Record an inbound inventory receipt and auto-create its batch. Atomic:
 * creates the batch, increments variant on-hand, and writes the adjustment +
 * audit event. Retries the batch number with a numeric suffix on collision.
 */
export async function createBatch(input: CreateBatchInput, actor: BatchActor) {
  validateCreateInput(input)
  const client = db()

  const resolved = await resolveVariant(input)
  const { userId: receivedById, name: receivedByName } = await resolveActor(actor)

  const qtyDamaged = input.qtyDamaged ?? 0
  const qtyOnHand = input.qtyReceived - qtyDamaged
  const bud = normalizeDateOnly(input.bud)
  const receivedOn = input.receivedOn ? normalizeDateOnly(input.receivedOn) : new Date()
  const purity = input.purity?.trim() || '99%HPLC'

  const numberInput: BatchNumberInput = {
    name: resolved.productName,
    dose: resolved.dose,
    bud: input.bud,
  }
  const base = buildBatchNumber(numberInput)

  for (let attempt = 1; attempt <= MAX_BATCH_NUMBER_ATTEMPTS; attempt += 1) {
    const batchNumber = withCollisionSuffix(base, attempt)
    try {
      const created = await client.$transaction(async (tx) => {
        const batch = await tx.inventoryBatch.create({
          data: {
            batchNumber,
            variantId: resolved.variantId,
            productName: resolved.productName,
            dose: resolved.dose,
            vialSize: resolved.vialSize,
            purity,
            bud,
            receivedOn,
            qtyReceived: input.qtyReceived,
            qtyDamaged,
            qtyOnHand,
            yearColor: input.yearColor?.trim() || null,
            notes: input.notes?.trim() || null,
            status: qtyOnHand > 0 ? 'RECEIVED' : 'DEPLETED',
            receivedById,
            receivedByName,
            events: {
              create: {
                type: 'RECEIVED',
                delta: qtyOnHand,
                note: input.notes?.trim() || null,
                performedBy: receivedByName,
              },
            },
          },
        })

        if (qtyOnHand > 0) {
          await tx.productVariant.update({
            where: { id: resolved.variantId },
            data: { inventoryOnHand: { increment: qtyOnHand } },
          })
          await tx.inventoryAdjustment.create({
            data: {
              variantId: resolved.variantId,
              delta: qtyOnHand,
              reason: 'RECEIPT',
              note: `Batch ${batchNumber} received`,
              createdById: receivedById,
              createdByName: receivedByName,
            },
          })
        }

        return batch
      })
      // Restock alert pass — fire-and-forget after the receive commits.
      if (qtyOnHand > 0) void fireBackInStockAlerts(resolved.variantId)
      return created
    } catch (err) {
      // A P2002 inside this transaction can only come from the batchNumber unique
      // index (the only unique value we write here). The pg driver adapter does
      // not always populate `meta.target`, so match on code + model instead.
      const isUnique =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.modelName === 'InventoryBatch' ||
          (Array.isArray(err.meta?.target) &&
            (err.meta?.target as string[]).includes('batchNumber')) ||
          err.meta?.modelName === undefined)
      if (isUnique) {
        continue // collision — try the next suffix
      }
      throw err
    }
  }
  throw new Error('Could not generate a unique batch number after multiple attempts')
}

export interface ListBatchesFilters {
  status?: BatchScope
  variantId?: string
  search?: string
  take?: number
}

/**
 * Translate a workspace scope into a Prisma filter. EXPIRING / EXPIRED are
 * derived from BUD + remaining stock so the same definitions the UI showed
 * client-side are now enforced in the query (and match the KPI counts).
 */
function batchScopeWhere(scope: BatchScope): Prisma.InventoryBatchWhereInput {
  const { start, end } = expiringWindow()
  switch (scope) {
    case 'ACTIVE':
    case 'RECEIVED':
      return { status: 'RECEIVED' }
    case 'EXPIRING':
      return { status: 'RECEIVED', qtyOnHand: { gt: 0 }, bud: { gte: start, lte: end } }
    case 'EXPIRED':
      return { status: { not: 'VOIDED' }, qtyOnHand: { gt: 0 }, bud: { lt: start } }
    case 'DEPLETED':
      return { status: 'DEPLETED' }
    case 'VOIDED':
      return { status: 'VOIDED' }
    default:
      return {}
  }
}

function batchListWhere(filters: {
  status?: BatchScope
  variantId?: string
  search?: string
}): Prisma.InventoryBatchWhereInput {
  const where: Prisma.InventoryBatchWhereInput = batchScopeWhere(filters.status ?? 'ALL')
  if (filters.variantId) where.variantId = filters.variantId
  if (filters.search) {
    where.OR = [
      { batchNumber: { contains: filters.search, mode: 'insensitive' } },
      { productName: { contains: filters.search, mode: 'insensitive' } },
      { variant: { sku: { contains: filters.search, mode: 'insensitive' } } },
    ]
  }
  return where
}

/** List batches (newest first) with the variant's product name attached. */
export async function listBatches(filters: ListBatchesFilters = {}) {
  const client = db()
  return client.inventoryBatch.findMany({
    where: batchListWhere(filters),
    orderBy: { createdAt: 'desc' },
    take: filters.take ?? 200,
    include: { variant: { select: { sku: true } } },
  })
}

export interface ListBatchesPagedFilters {
  status?: BatchScope
  variantId?: string
  search?: string
  page?: number
  pageSize?: number
  sort?: BatchSortKey
  dir?: SortDir
}

export interface PagedBatches {
  batches: Awaited<ReturnType<typeof listBatches>>
  total: number
  page: number
  pageSize: number
}

/**
 * Server-driven batch list for the Inventory workspace: scope (including the
 * derived EXPIRING / EXPIRED filters), search, sort, and offset pagination in
 * one query pair. `total` counts all rows matching the filter, not the page.
 */
export async function listBatchesPaged(filters: ListBatchesPagedFilters = {}): Promise<PagedBatches> {
  const client = db()
  const where = batchListWhere(filters)
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(500, Math.max(1, filters.pageSize ?? 25))
  const sortKey = filters.sort ?? 'createdAt'
  const dir = filters.dir ?? 'desc'
  const [batches, total] = await Promise.all([
    client.inventoryBatch.findMany({
      where,
      orderBy: [{ [sortKey]: dir }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { variant: { select: { sku: true } } },
    }),
    client.inventoryBatch.count({ where }),
  ])
  return { batches, total, page, pageSize }
}

/** Fetch a single batch with its full audit timeline. */
export async function getBatch(id: string) {
  return db().inventoryBatch.findUnique({
    where: { id },
    include: {
      variant: { select: { sku: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  })
}

export interface UpdateBatchInput {
  purity?: string | null
  vialSize?: string | null
  yearColor?: string | null
  notes?: string | null
}

/**
 * Update label-cosmetic / informational fields on a batch. Counts, batch
 * number, BUD and variant are immutable here (they are audit-tracked at intake).
 */
export async function updateBatch(id: string, input: UpdateBatchInput, actor: BatchActor) {
  const client = db()
  if (input.yearColor && !/^#[0-9a-fA-F]{6}$/.test(input.yearColor)) {
    throw new BatchValidationError('Accent color must be a #rrggbb hex value', 'yearColor')
  }
  const data: Prisma.InventoryBatchUpdateInput = {}
  if (input.purity !== undefined) data.purity = input.purity?.trim() || '99%HPLC'
  if (input.vialSize !== undefined) data.vialSize = input.vialSize?.trim() || null
  if (input.yearColor !== undefined) data.yearColor = input.yearColor?.trim() || null
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null
  return client.inventoryBatch.update({
    where: { id },
    data: {
      ...data,
      events: {
        create: { type: 'ADJUSTED', note: 'Batch details edited', performedBy: actor.label ?? null },
      },
    },
  })
}

/**
 * Void a batch (admin action). Returns the remaining on-hand to the void state,
 * decrements the variant's on-hand by whatever was left, and records the
 * reversal as an InventoryAdjustment + event. Idempotent: voiding a voided
 * batch is a no-op.
 */
export async function voidBatch(id: string, reason: string, actor: BatchActor) {
  const client = db()
  const { userId: receivedById, name: receivedByName } = await resolveActor(actor)
  return client.$transaction(async (tx) => {
    const batch = await tx.inventoryBatch.findUnique({ where: { id } })
    if (!batch) throw new BatchValidationError('Batch not found', 'id')
    if (batch.status === 'VOIDED') return batch

    const remaining = batch.qtyOnHand
    const updated = await tx.inventoryBatch.update({
      where: { id },
      data: {
        status: 'VOIDED',
        qtyOnHand: 0,
        notes: reason ? `${batch.notes ? batch.notes + ' | ' : ''}VOID: ${reason}` : batch.notes,
        events: {
          create: {
            type: 'VOIDED',
            delta: -remaining,
            note: reason || null,
            performedBy: receivedByName,
          },
        },
      },
    })

    if (remaining > 0) {
      await tx.productVariant.update({
        where: { id: batch.variantId },
        data: { inventoryOnHand: { decrement: remaining } },
      })
      await tx.inventoryAdjustment.create({
        data: {
          variantId: batch.variantId,
          delta: -remaining,
          reason: 'MANUAL_ADJUSTMENT',
          note: `Batch ${batch.batchNumber} voided`,
          createdById: receivedById,
          createdByName: receivedByName,
        },
      })
    }
    return updated
  })
}

/**
 * Record a label-print event for a batch WITHOUT changing stock. Printing
 * labels for received vials is not consumption — this is audit-only.
 */
export async function recordLabelPrintEvent(
  batchId: string,
  qty: number,
  actor: BatchActor
): Promise<void> {
  await db().inventoryBatchEvent.create({
    data: {
      batchId,
      type: 'LABELS_PRINTED',
      delta: null,
      note: `${qty} label(s) generated`,
      performedBy: actor.label ?? null,
    },
  })
}

/**
 * Start of the current UTC day. BUDs are stored as date-only UTC midnight;
 * batches with `bud < minAllocatableBud()` are past their beyond-use date and
 * must never be allocated or shipped (a batch whose BUD is today is still
 * usable through the day).
 */
export function minAllocatableBud(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * Batches for a variant eligible for FIFO allocation (RECEIVED, on-hand > 0,
 * not past BUD, soonest BUD first).
 */
export async function allocatableBatchesForVariant(variantId: string) {
  return db().inventoryBatch.findMany({
    where: {
      variantId,
      status: 'RECEIVED',
      qtyOnHand: { gt: 0 },
      bud: { gte: minAllocatableBud() },
    },
    orderBy: [{ bud: 'asc' }, { batchNumber: 'asc' }],
  })
}

type AllocatableBatchRow = Awaited<ReturnType<typeof allocatableBatchesForVariant>>[number]

/**
 * Batched form of {@link allocatableBatchesForVariant}: fetch eligible batches
 * for many variants in a SINGLE query (avoids the N+1 of calling the per-variant
 * helper in a loop), returned grouped by variantId. Within each group the FIFO
 * order (soonest BUD first, then batch number) is preserved.
 */
export async function allocatableBatchesForVariants(
  variantIds: string[]
): Promise<Map<string, AllocatableBatchRow[]>> {
  const grouped = new Map<string, AllocatableBatchRow[]>()
  const ids = Array.from(new Set(variantIds))
  if (ids.length === 0) return grouped

  const rows = await db().inventoryBatch.findMany({
    where: {
      variantId: { in: ids },
      status: 'RECEIVED',
      qtyOnHand: { gt: 0 },
      bud: { gte: minAllocatableBud() },
    },
    orderBy: [{ bud: 'asc' }, { batchNumber: 'asc' }],
  })
  for (const row of rows) {
    const list = grouped.get(row.variantId)
    if (list) list.push(row)
    else grouped.set(row.variantId, [row])
  }
  return grouped
}

/**
 * Record that `qty` labels were printed against a batch (decrements on-hand,
 * FIFO is the caller's concern when spanning batches). Used by order-label
 * generation so printed labels draw down stock. Pass `dryRun` to compute the
 * plan without mutating.
 */
export async function recordLabelsPrinted(
  batchId: string,
  qty: number,
  actor: BatchActor
): Promise<void> {
  const client = db()
  await client.$transaction((tx) => recordLabelsPrintedTx(tx, batchId, qty, actor))
}

/**
 * Core of {@link recordLabelsPrinted}, parameterized by a transaction client.
 *
 * The stock drawdown is an ATOMIC conditional decrement (`updateMany` with a
 * `qtyOnHand >= take` guard). If a concurrent draw already took the stock the
 * guarded update affects 0 rows and we throw, aborting the whole transaction —
 * this prevents the lost-update / negative-stock race that a read-modify-write
 * would allow. The caller (fulfillment) plans against a snapshot; a concurrent
 * change simply forces a safe retry rather than corrupting counts.
 */
export async function recordLabelsPrintedTx(
  tx: Prisma.TransactionClient,
  batchId: string,
  qty: number,
  actor: BatchActor
): Promise<void> {
  const batch = await tx.inventoryBatch.findUnique({
    where: { id: batchId },
    select: { id: true, variantId: true, batchNumber: true, status: true, qtyOnHand: true },
  })
  if (!batch) throw new BatchValidationError('Batch not found', 'batchId')
  const take = Math.max(0, Math.trunc(qty))
  if (take <= 0) return

  const decremented = await tx.inventoryBatch.updateMany({
    where: { id: batchId, qtyOnHand: { gte: take } },
    data: { qtyOnHand: { decrement: take } },
  })
  if (decremented.count === 0) {
    throw new BatchValidationError(
      `Batch ${batch.batchNumber} stock changed during fulfillment; please retry`,
      'batchId'
    )
  }

  const nextOnHand = batch.qtyOnHand - take
  const { userId: actorUserId, name: actorName } = await resolveInventoryActor(
    tx,
    actor.clerkUserId,
    actor.label
  )
  await tx.inventoryBatch.update({
    where: { id: batchId },
    data: {
      status: nextOnHand <= 0 ? 'DEPLETED' : batch.status,
      events: {
        create: {
          type: 'LABELS_PRINTED',
          delta: -take,
          performedBy: actorName ?? actor.label ?? null,
        },
      },
    },
  })
  await tx.productVariant.update({
    where: { id: batch.variantId },
    data: { inventoryOnHand: { decrement: take } },
  })
  await tx.inventoryAdjustment.create({
    data: {
      variantId: batch.variantId,
      delta: -take,
      reason: 'ORDER_FULFILLMENT',
      note: `Labels printed for batch ${batch.batchNumber}`,
      createdById: actorUserId,
      createdByName: actorName,
    },
  })
}

/**
 * Batched form of {@link recordLabelsPrinted}: apply many batch draws in a
 * SINGLE transaction instead of opening one transaction per draw (avoids the
 * sequential-transaction overhead when consuming a multi-line order).
 */
export async function recordLabelsPrintedMany(
  draws: Array<{ batchId: string; qty: number }>,
  actor: BatchActor
): Promise<void> {
  if (draws.length === 0) return
  const client = db()
  await client.$transaction(async (tx) => {
    for (const draw of draws) {
      await recordLabelsPrintedTx(tx, draw.batchId, draw.qty, actor)
    }
  })
}
