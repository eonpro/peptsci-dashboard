/**
 * Stock count service — preview a pasted physical count against the live
 * catalog, then apply it in ONE transaction.
 *
 * Apply, per line: set ProductVariant.inventoryOnHand to the counted number
 * plus every movement recorded after the count time (InventoryAdjustment
 * reason AUDIT), move the variant's batches to the same total
 * (InventoryBatchEvent ADJUSTED; optional new batch when a BUD is given for
 * units no usable batch can hold), and record the whole count as one AuditLog
 * snapshot. Reservations are never touched: reserved units are still on the
 * shelf until they ship.
 *
 * Replayed movements are every InventoryAdjustment after the count time
 * except AUDIT ones — those are corrections the count supersedes (including
 * this tool's own writes, so re-applying a count is a no-op).
 *
 * Concurrency: every line carries the on-hand + batch total the preview
 * showed. Any difference (an order shipped, a receipt landed) aborts the whole
 * transaction with STOCK_CHANGED so the operator re-previews and sees the new
 * deltas; the writes themselves are conditional updates on the same values.
 *
 * Pure parsing / matching / planning lives in ./stock-count-core.
 */

import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { logger } from '../logger'
import { fireBackInStockAlerts } from '../back-in-stock'
import { resolveInventoryActor } from '../inventory-log'
import { buildBatchNumber, withCollisionSuffix } from '../batch-number'
import type { BatchActor } from '../inventory-batches-core'
import { displayProductName } from '../products/named-blends'
import { BUSINESS_TIME_ZONE, nyDayString } from '../reports/core'
import {
  budDay,
  buildStockCountPreview,
  countTarget,
  formatDoseAmounts,
  parseDoseAmounts,
  planBatchReconciliation,
  validateCountedAt,
  validateStockCountApplyLines,
  type StockCountApplyLine,
  type StockCountBatch,
  type StockCountCatalogVariant,
  type StockCountPreview,
} from './stock-count-core'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

const COUNT_TIME_LABEL = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function resolveCountedAt(value: string | null | undefined, now: Date): Date {
  const resolved = validateCountedAt(value, now)
  if ('error' in resolved) throw new StockCountError(resolved.error, 'INVALID')
  return resolved.at
}

/**
 * Net on-hand movement per variant recorded after `countedAt`, excluding AUDIT
 * corrections (the count supersedes them).
 */
async function movementsSince(
  client: Prisma.TransactionClient,
  countedAt: Date,
  variantIds?: string[]
): Promise<Map<string, number>> {
  const rows = await client.inventoryAdjustment.groupBy({
    by: ['variantId'],
    where: {
      createdAt: { gt: countedAt },
      reason: { not: 'AUDIT' },
      ...(variantIds ? { variantId: { in: variantIds } } : {}),
    },
    _sum: { delta: true },
  })
  return new Map(rows.map((r) => [r.variantId, r._sum.delta ?? 0]))
}

const VARIANT_SELECT = {
  id: true,
  sku: true,
  dose: true,
  unitSize: true,
  status: true,
  inventoryOnHand: true,
  inventoryReserved: true,
  product: { select: { name: true, aka: true, status: true } },
  batches: {
    where: { status: { not: 'VOIDED' } },
    select: { id: true, batchNumber: true, bud: true, status: true, qtyOnHand: true },
  },
} satisfies Prisma.ProductVariantSelect

type VariantRow = Prisma.ProductVariantGetPayload<{ select: typeof VARIANT_SELECT }>

function toBatches(row: VariantRow): StockCountBatch[] {
  return row.batches.map((b) => ({ ...b, bud: b.bud.toISOString() }))
}

function batchUnits(row: VariantRow): number {
  return row.batches.reduce((s, b) => s + Math.max(0, b.qtyOnHand), 0)
}

function toCatalogVariant(row: VariantRow): StockCountCatalogVariant {
  return {
    variantId: row.id,
    productName: row.product.name,
    aka: row.product.aka,
    dose: row.dose,
    sku: row.sku,
    variantActive: row.status === 'ACTIVE',
    productActive: row.product.status === 'ACTIVE',
    onHand: row.inventoryOnHand,
    reserved: row.inventoryReserved,
    batches: toBatches(row),
  }
}

function variantLabel(row: VariantRow) {
  const parsed = parseDoseAmounts(row.dose)
  return {
    name: displayProductName(row.product.name, row.sku),
    dose: parsed ? formatDoseAmounts(parsed) : (row.dose ?? ''),
    sku: row.sku,
  }
}

function conflict(row: VariantRow, line: StockCountApplyLine): StockCountConflict {
  return {
    variantId: row.id,
    ...variantLabel(row),
    expectedOnHand: line.expectedOnHand,
    onHand: row.inventoryOnHand,
    expectedBatchTotal: line.expectedBatchTotal,
    batchTotal: batchUnits(row),
  }
}

/**
 * Every variant (inactive ones too, so a counted item that was switched off
 * is reported instead of "not found"), with its non-voided batches and the
 * movement recorded since `countedAt`.
 */
export async function loadStockCountCatalog(
  countedAt: Date = new Date()
): Promise<StockCountCatalogVariant[]> {
  const client = db()
  const [rows, since] = await Promise.all([
    client.productVariant.findMany({
      select: VARIANT_SELECT,
      orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
    }),
    movementsSince(client, countedAt),
  ])
  return rows.map((row) => ({ ...toCatalogVariant(row), sinceCount: since.get(row.id) ?? 0 }))
}

/** Read-only: what applying the pasted count would change. */
export async function previewStockCount(input: {
  text: string
  zeroUnlisted?: boolean
  /** When the shelf was counted (ISO); defaults to now. */
  countedAt?: string | null
}): Promise<StockCountPreview> {
  const now = new Date()
  const catalog = await loadStockCountCatalog(resolveCountedAt(input.countedAt, now))
  return buildStockCountPreview({
    text: input.text,
    catalog,
    zeroUnlisted: input.zeroUnlisted,
    today: now,
  })
}

export interface StockCountConflict {
  variantId: string
  name: string
  dose: string
  sku: string | null
  expectedOnHand: number
  onHand: number
  expectedBatchTotal: number
  batchTotal: number
}

export class StockCountError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID' | 'NOT_FOUND' | 'STOCK_CHANGED',
    public readonly conflicts: StockCountConflict[] = []
  ) {
    super(message)
    this.name = 'StockCountError'
  }
}

export interface StockCountResult {
  countId: string
  /** When the shelf was counted (ISO). */
  countedAt: string
  lines: number
  changed: number
  unchanged: number
  unitsBefore: number
  unitsAfter: number
  netChange: number
  batchesAdjusted: number
  batchesCreated: number
  /** Counted units still outside any usable batch (no BUD was given). */
  unbatched: Array<{
    variantId: string
    name: string
    dose: string
    sku: string | null
    units: number
  }>
}

export interface ApplyStockCountInput {
  lines: StockCountApplyLine[]
  /** When the shelf was counted (ISO) — must match the preview; defaults to now. */
  countedAt?: string | null
  note?: string | null
}

function utcDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

async function createCountBatchTx(
  tx: Prisma.TransactionClient,
  row: VariantRow,
  batch: { bud: string; qty: number },
  receivedOn: string,
  actor: { userId: string | null; name: string | null },
  note: string
) {
  const productName = displayProductName(row.product.name, row.sku)
  const dose = row.dose ?? ''
  const base = buildBatchNumber({ name: productName, dose, bud: batch.bud })
  const taken = new Set(
    (
      await tx.inventoryBatch.findMany({
        where: { batchNumber: { startsWith: base } },
        select: { batchNumber: true },
      })
    ).map((b) => b.batchNumber)
  )
  let attempt = 1
  while (taken.has(withCollisionSuffix(base, attempt))) attempt += 1
  return tx.inventoryBatch.create({
    data: {
      batchNumber: withCollisionSuffix(base, attempt),
      variantId: row.id,
      productName,
      dose,
      vialSize: row.unitSize,
      bud: utcDate(batch.bud),
      receivedOn: utcDate(receivedOn),
      qtyReceived: batch.qty,
      qtyOnHand: batch.qty,
      status: 'RECEIVED',
      notes: `${note} — counted units that had no batch`,
      receivedById: actor.userId,
      receivedByName: actor.name,
      events: {
        create: { type: 'RECEIVED', delta: batch.qty, note, performedBy: actor.name },
      },
    },
    select: { id: true, batchNumber: true },
  })
}

/**
 * Apply a previewed count atomically. Throws {@link StockCountError}:
 * INVALID (bad payload), NOT_FOUND (variant deleted), STOCK_CHANGED (stock
 * moved since the preview — nothing was written).
 */
export async function applyStockCount(
  input: ApplyStockCountInput,
  actor: BatchActor
): Promise<StockCountResult> {
  const problem = validateStockCountApplyLines(input.lines)
  if (problem) throw new StockCountError(problem, 'INVALID')

  const now = new Date()
  const today = budDay(now)
  const countedAt = resolveCountedAt(input.countedAt, now)
  for (const line of input.lines) {
    if (line.newBatchBud && line.newBatchBud < today) {
      throw new StockCountError('A new batch BUD cannot be in the past.', 'INVALID')
    }
  }

  const countId = randomUUID()
  const userNote = input.note?.trim().slice(0, 500) || null
  const tag = `Stock count ${COUNT_TIME_LABEL.format(countedAt)} ET · ref ${countId.slice(0, 8)}`

  const outcome = await db().$transaction(
    async (tx) => {
      const ids = input.lines.map((l) => l.variantId)
      const rows = await tx.productVariant.findMany({
        where: { id: { in: ids } },
        select: VARIANT_SELECT,
      })
      const byId = new Map(rows.map((r) => [r.id, r]))
      const missing = ids.filter((id) => !byId.has(id)).length
      if (missing > 0) {
        throw new StockCountError(
          `${missing} product(s) in this count no longer exist — preview the count again.`,
          'NOT_FOUND'
        )
      }

      const stockChanged = (list: StockCountConflict[]) =>
        new StockCountError(
          `Stock changed for ${list.length} product(s) since the preview — review the updated count before applying.`,
          'STOCK_CHANGED',
          list
        )
      const conflicts = input.lines
        .map((line) => ({ line, row: byId.get(line.variantId)! }))
        .filter(
          ({ line, row }) =>
            row.inventoryOnHand !== line.expectedOnHand ||
            batchUnits(row) !== line.expectedBatchTotal
        )
        .map(({ line, row }) => conflict(row, line))
      if (conflicts.length > 0) throw stockChanged(conflicts)
      // A conditional write that loses a race to a concurrent draw reports the
      // fresh values and aborts the whole count.
      const lostRace = async (line: StockCountApplyLine) => {
        const fresh = await tx.productVariant.findUnique({
          where: { id: line.variantId },
          select: VARIANT_SELECT,
        })
        return stockChanged(fresh ? [conflict(fresh, line)] : [])
      }

      const since = await movementsSince(tx, countedAt, ids)
      const { userId, name: actorName } = await resolveInventoryActor(
        tx,
        actor.clerkUserId,
        actor.label
      )
      const result: StockCountResult = {
        countId,
        countedAt: countedAt.toISOString(),
        lines: input.lines.length,
        changed: 0,
        unchanged: 0,
        unitsBefore: 0,
        unitsAfter: 0,
        netChange: 0,
        batchesAdjusted: 0,
        batchesCreated: 0,
        unbatched: [],
      }
      const restocked: string[] = []
      const snapshot: Array<Record<string, unknown>> = []

      for (const line of input.lines) {
        const row = byId.get(line.variantId)!
        const sinceCount = since.get(row.id) ?? 0
        const target = countTarget(line.counted, sinceCount)
        const plan = planBatchReconciliation(toBatches(row), target, now, line.newBatchBud)
        const before = row.inventoryOnHand
        const delta = target - before

        if (delta !== 0) {
          const set = await tx.productVariant.updateMany({
            where: { id: row.id, inventoryOnHand: before },
            data: { inventoryOnHand: target },
          })
          if (set.count !== 1) throw await lostRace(line)
          const replayed = sinceCount
            ? `, ${sinceCount > 0 ? '+' : ''}${sinceCount} moved since → ${target}`
            : ''
          await tx.inventoryAdjustment.create({
            data: {
              variantId: row.id,
              delta,
              reason: 'AUDIT',
              note: `${tag}: counted ${line.counted}${replayed} (system had ${before})${userNote ? ` — ${userNote}` : ''}`,
              createdById: userId,
              createdByName: actorName,
            },
          })
        }

        for (const change of plan.changes) {
          const moved = await tx.inventoryBatch.updateMany({
            where: { id: change.batchId, qtyOnHand: change.from, status: { not: 'VOIDED' } },
            data: { qtyOnHand: change.to, status: change.to > 0 ? 'RECEIVED' : 'DEPLETED' },
          })
          if (moved.count !== 1) throw await lostRace(line)
          await tx.inventoryBatchEvent.create({
            data: {
              batchId: change.batchId,
              type: 'ADJUSTED',
              delta: change.to - change.from,
              note: tag,
              performedBy: actorName,
            },
          })
        }

        const created = plan.newBatch
          ? await createCountBatchTx(
              tx,
              row,
              plan.newBatch,
              nyDayString(countedAt),
              { userId, name: actorName },
              tag
            )
          : null

        const changed = delta !== 0 || plan.changes.length > 0 || created !== null
        result.changed += changed ? 1 : 0
        result.unchanged += changed ? 0 : 1
        result.unitsBefore += before
        result.unitsAfter += target
        result.netChange += delta
        result.batchesAdjusted += plan.changes.length
        result.batchesCreated += created ? 1 : 0
        if (plan.unbatched > 0) {
          result.unbatched.push({ variantId: row.id, ...variantLabel(row), units: plan.unbatched })
        }
        if (before - row.inventoryReserved <= 0 && target - row.inventoryReserved > 0) {
          restocked.push(row.id)
        }
        snapshot.push({
          variantId: row.id,
          sku: row.sku,
          label: line.label ?? null,
          before,
          counted: line.counted,
          sinceCount,
          target,
          delta,
          reserved: row.inventoryReserved,
          batchChanges: plan.changes,
          newBatch: created ? { ...plan.newBatch, batchNumber: created.batchNumber } : null,
          unbatched: plan.unbatched,
        })
      }

      await tx.auditLog.create({
        data: {
          userId,
          entity: 'InventoryCount',
          entityId: countId,
          action: 'stock_count_applied',
          metadata: {
            countedAt: countedAt.toISOString(),
            note: userNote,
            by: actorName,
            totals: {
              lines: result.lines,
              changed: result.changed,
              unitsBefore: result.unitsBefore,
              unitsAfter: result.unitsAfter,
              netChange: result.netChange,
            },
            lines: snapshot,
          } as Prisma.InputJsonValue,
        },
      })

      return { result, restocked }
    },
    // ~4 statements per line; a full catalog count stays well under this.
    { maxWait: 10_000, timeout: 60_000 }
  )

  for (const variantId of outcome.restocked) void fireBackInStockAlerts(variantId)
  logger.info('Stock count applied', {
    countId,
    countedAt: outcome.result.countedAt,
    lines: outcome.result.lines,
    changed: outcome.result.changed,
    netChange: outcome.result.netChange,
    by: actor.clerkUserId ?? null,
  })
  return outcome.result
}
