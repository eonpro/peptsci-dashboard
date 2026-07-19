/**
 * Inventory workspace summary: the KPI counters, movement series, and
 * top/expiring rollups behind GET /api/admin/inventory/summary. Everything is
 * computed with Prisma aggregates / narrow selects so the numbers stay correct
 * no matter how the workspace tables are paginated.
 */

import { prisma } from './prisma'
import { availableQty } from './inventory/reservations-core'
import {
  buildMovementSeries,
  buildReasonTotals,
  expiringWindow,
  utcDayStart,
  type MovementPoint,
  type ReasonTotal,
} from './inventory-workspace-core'

export interface InventorySummaryKpis {
  onHand: number
  reserved: number
  available: number
  activeBatches: number
  lowStock: number
  expiringSoon: number
  expired: number
  activeReservations: number
  reservedUnits: number
}

export interface TopProductRow {
  variantId: string
  productName: string
  dose: string | null
  sku: string | null
  onHand: number
  reserved: number
  available: number
}

export interface ExpiringBatchRow {
  id: string
  batchNumber: string
  productName: string
  dose: string
  bud: string
  qtyOnHand: number
}

export interface InventorySummary {
  kpis: InventorySummaryKpis
  /** Per-day inbound/outbound units over the trailing window. */
  movement: MovementPoint[]
  /** Inbound/outbound unit totals per adjustment reason over the same window. */
  reasonTotals: ReasonTotal[]
  /** Highest on-hand variants (for the stock-by-product chart). */
  topProducts: TopProductRow[]
  /** Soonest-expiring batches that still hold stock. */
  expiringBatches: ExpiringBatchRow[]
  windowDays: number
}

const TOP_PRODUCTS_LIMIT = 10
const EXPIRING_BATCHES_LIMIT = 20

export async function getInventorySummary(windowDays = 30): Promise<InventorySummary> {
  if (!prisma) {
    return {
      kpis: {
        onHand: 0,
        reserved: 0,
        available: 0,
        activeBatches: 0,
        lowStock: 0,
        expiringSoon: 0,
        expired: 0,
        activeReservations: 0,
        reservedUnits: 0,
      },
      movement: [],
      reasonTotals: [],
      topProducts: [],
      expiringBatches: [],
      windowDays,
    }
  }

  const days = Math.min(365, Math.max(1, Math.trunc(windowDays)))
  const today = utcDayStart()
  const { start: expStart, end: expEnd } = expiringWindow()
  const movementSince = new Date(today.getTime() - (days - 1) * 86_400_000)

  const [variants, activeBatches, expiringSoon, expired, movements, expiringBatches, reservationAgg] =
    await Promise.all([
      prisma.productVariant.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          sku: true,
          dose: true,
          inventoryOnHand: true,
          inventoryReserved: true,
          reorderLevel: true,
          product: { select: { name: true } },
        },
      }),
      prisma.inventoryBatch.count({ where: { status: 'RECEIVED' } }),
      prisma.inventoryBatch.count({
        where: { status: 'RECEIVED', qtyOnHand: { gt: 0 }, bud: { gte: expStart, lte: expEnd } },
      }),
      prisma.inventoryBatch.count({
        where: { status: { not: 'VOIDED' }, qtyOnHand: { gt: 0 }, bud: { lt: today } },
      }),
      prisma.inventoryAdjustment.findMany({
        where: { createdAt: { gte: movementSince } },
        select: { createdAt: true, delta: true, reason: true },
      }),
      prisma.inventoryBatch.findMany({
        where: { status: 'RECEIVED', qtyOnHand: { gt: 0 } },
        orderBy: { bud: 'asc' },
        take: EXPIRING_BATCHES_LIMIT,
        select: {
          id: true,
          batchNumber: true,
          productName: true,
          dose: true,
          bud: true,
          qtyOnHand: true,
        },
      }),
      prisma.inventoryReservation.aggregate({
        where: { status: 'ACTIVE' },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
    ])

  let onHand = 0
  let reserved = 0
  let lowStock = 0
  for (const v of variants) {
    onHand += v.inventoryOnHand
    reserved += v.inventoryReserved
    const available = availableQty(v.inventoryOnHand, v.inventoryReserved)
    if (v.reorderLevel > 0 && available <= v.reorderLevel) lowStock += 1
  }

  const topProducts: TopProductRow[] = [...variants]
    .sort((a, b) => b.inventoryOnHand - a.inventoryOnHand)
    .slice(0, TOP_PRODUCTS_LIMIT)
    .filter((v) => v.inventoryOnHand > 0)
    .map((v) => ({
      variantId: v.id,
      productName: v.product.name,
      dose: v.dose,
      sku: v.sku,
      onHand: v.inventoryOnHand,
      reserved: v.inventoryReserved,
      available: availableQty(v.inventoryOnHand, v.inventoryReserved),
    }))

  return {
    kpis: {
      onHand,
      reserved,
      available: Math.max(0, onHand - reserved),
      activeBatches,
      lowStock,
      expiringSoon,
      expired,
      activeReservations: reservationAgg._count._all,
      reservedUnits: reservationAgg._sum.quantity ?? 0,
    },
    movement: buildMovementSeries(movements, days),
    reasonTotals: buildReasonTotals(movements),
    topProducts,
    expiringBatches: expiringBatches.map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      productName: b.productName,
      dose: b.dose,
      bud: b.bud.toISOString(),
      qtyOnHand: b.qtyOnHand,
    })),
    windowDays: days,
  }
}
