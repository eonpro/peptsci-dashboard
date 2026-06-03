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

/** Resolve the DB User.id for an actor's Clerk id, or null if no row exists. */
async function resolveUserId(actor: BatchActor): Promise<string | null> {
  if (!actor.clerkUserId) return null
  const user = await db().user.findUnique({
    where: { clerkUserId: actor.clerkUserId },
    select: { id: true },
  })
  return user?.id ?? null
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
  const receivedById = await resolveUserId(actor)
  const receivedByName = actor.label?.trim() || null

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
      return await client.$transaction(async (tx) => {
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
            },
          })
        }

        return batch
      })
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
  status?: 'RECEIVED' | 'DEPLETED' | 'VOIDED' | 'ALL'
  variantId?: string
  search?: string
  take?: number
}

/** List batches (newest first) with the variant's product name attached. */
export async function listBatches(filters: ListBatchesFilters = {}) {
  const client = db()
  const where: Prisma.InventoryBatchWhereInput = {}
  if (filters.status && filters.status !== 'ALL') where.status = filters.status
  if (filters.variantId) where.variantId = filters.variantId
  if (filters.search) {
    where.OR = [
      { batchNumber: { contains: filters.search, mode: 'insensitive' } },
      { productName: { contains: filters.search, mode: 'insensitive' } },
    ]
  }
  return client.inventoryBatch.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filters.take ?? 200,
    include: { variant: { select: { sku: true } } },
  })
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
  const receivedByName = actor.label?.trim() || null
  const receivedById = await resolveUserId(actor)
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
 * Batches for a variant eligible for FIFO allocation (RECEIVED, on-hand > 0,
 * soonest BUD first).
 */
export async function allocatableBatchesForVariant(variantId: string) {
  return db().inventoryBatch.findMany({
    where: { variantId, status: 'RECEIVED', qtyOnHand: { gt: 0 } },
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
    where: { variantId: { in: ids }, status: 'RECEIVED', qtyOnHand: { gt: 0 } },
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

/** Core of {@link recordLabelsPrinted}, parameterized by a transaction client. */
async function recordLabelsPrintedTx(
  tx: Prisma.TransactionClient,
  batchId: string,
  qty: number,
  actor: BatchActor
): Promise<void> {
  const batch = await tx.inventoryBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new BatchValidationError('Batch not found', 'batchId')
  const take = Math.min(batch.qtyOnHand, Math.max(0, Math.trunc(qty)))
  if (take <= 0) return
  const nextOnHand = batch.qtyOnHand - take
  await tx.inventoryBatch.update({
    where: { id: batchId },
    data: {
      qtyOnHand: nextOnHand,
      status: nextOnHand <= 0 ? 'DEPLETED' : batch.status,
      events: {
        create: {
          type: 'LABELS_PRINTED',
          delta: -take,
          performedBy: actor.label ?? null,
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
