/**
 * Copy one clinic's custom pricing model onto another.
 *
 * `planCopyClientPricing` is the pure decision layer (tested without DB).
 * `copyClientPricing` applies the plan in Postgres.
 */

import { prisma } from './prisma'
import { logger } from './logger'
import { setClientPricing, removeClientPricing } from './pricing'

export interface CopyPriceRow {
  variantId: string
  customPrice: number
  discountPercent: number | null
  notes: string | null
  isActive: boolean
}

export interface CopyPriceUpsert {
  variantId: string
  customPrice: number
  discountPercent: number | null
  notes: string | null
}

export interface CopyClientPricingPlan {
  upserts: CopyPriceUpsert[]
  deactivate: string[]
}

export function planCopyClientPricing(
  sourceRows: CopyPriceRow[],
  targetRows: CopyPriceRow[],
  options?: { replace?: boolean }
): CopyClientPricingPlan {
  const replace = options?.replace ?? true
  const upserts: CopyPriceUpsert[] = []
  const sourceIds = new Set<string>()

  for (const row of sourceRows) {
    if (!row.isActive) continue
    if (!Number.isFinite(row.customPrice) || row.customPrice <= 0) continue
    sourceIds.add(row.variantId)
    upserts.push({
      variantId: row.variantId,
      customPrice: row.customPrice,
      discountPercent: row.discountPercent,
      notes: row.notes,
    })
  }

  const deactivate: string[] = []
  if (replace) {
    for (const row of targetRows) {
      if (!row.isActive) continue
      if (!sourceIds.has(row.variantId)) deactivate.push(row.variantId)
    }
  }

  return { upserts, deactivate }
}

export interface CopyClientPricingResult {
  success: boolean
  copied: number
  cleared: number
  paysAtCostCopied: boolean
  sourcePaysAtCost: boolean
  error?: string
}

/**
 * Replace (default) or merge the target clinic's custom prices with the
 * source clinic's active model. Optionally copies `paysAtCost`.
 */
export async function copyClientPricing(opts: {
  sourceClientId: string
  targetClientId: string
  replace?: boolean
  copyPaysAtCost?: boolean
  createdBy?: string
}): Promise<CopyClientPricingResult> {
  const replace = opts.replace ?? true
  const copyPaysAtCost = opts.copyPaysAtCost ?? true
  const empty: CopyClientPricingResult = {
    success: false,
    copied: 0,
    cleared: 0,
    paysAtCostCopied: false,
    sourcePaysAtCost: false,
  }

  if (!prisma) {
    return { ...empty, error: 'Database not connected' }
  }
  if (opts.sourceClientId === opts.targetClientId) {
    return { ...empty, error: 'Cannot copy a client onto itself' }
  }

  const [source, target] = await Promise.all([
    prisma.client.findUnique({
      where: { id: opts.sourceClientId },
      select: { id: true, paysAtCost: true },
    }),
    prisma.client.findUnique({
      where: { id: opts.targetClientId },
      select: { id: true },
    }),
  ])

  if (!source) return { ...empty, error: 'Source client not found' }
  if (!target) return { ...empty, error: 'Target client not found' }

  const [sourceRows, targetRows] = await Promise.all([
    prisma.clientPricing.findMany({
      where: { clientId: opts.sourceClientId },
      select: {
        variantId: true,
        customPrice: true,
        discountPercent: true,
        notes: true,
        isActive: true,
      },
    }),
    prisma.clientPricing.findMany({
      where: { clientId: opts.targetClientId },
      select: {
        variantId: true,
        customPrice: true,
        discountPercent: true,
        notes: true,
        isActive: true,
      },
    }),
  ])

  const plan = planCopyClientPricing(
    sourceRows.map((r) => ({
      variantId: r.variantId,
      customPrice: Number(r.customPrice),
      discountPercent: r.discountPercent != null ? Number(r.discountPercent) : null,
      notes: r.notes,
      isActive: r.isActive,
    })),
    targetRows.map((r) => ({
      variantId: r.variantId,
      customPrice: Number(r.customPrice),
      discountPercent: r.discountPercent != null ? Number(r.discountPercent) : null,
      notes: r.notes,
      isActive: r.isActive,
    })),
    { replace }
  )

  let copied = 0
  let cleared = 0

  for (const upsert of plan.upserts) {
    const result = await setClientPricing(
      opts.targetClientId,
      upsert.variantId,
      upsert.customPrice,
      {
        discountPercent: upsert.discountPercent ?? undefined,
        notes: upsert.notes ?? undefined,
        createdBy: opts.createdBy,
      }
    )
    if (!result.success) {
      return {
        ...empty,
        copied,
        cleared,
        sourcePaysAtCost: source.paysAtCost,
        error: result.error || `Failed to copy price for ${upsert.variantId}`,
      }
    }
    copied++
  }

  for (const variantId of plan.deactivate) {
    const result = await removeClientPricing(opts.targetClientId, variantId)
    if (!result.success) {
      return {
        ...empty,
        copied,
        cleared,
        sourcePaysAtCost: source.paysAtCost,
        error: result.error || `Failed to clear price for ${variantId}`,
      }
    }
    cleared++
  }

  let paysAtCostCopied = false
  if (copyPaysAtCost) {
    await prisma.client.update({
      where: { id: opts.targetClientId },
      data: { paysAtCost: source.paysAtCost },
    })
    paysAtCostCopied = true
  }

  logger.info('Copied client pricing model', {
    sourceClientId: opts.sourceClientId,
    targetClientId: opts.targetClientId,
    copied,
    cleared,
    paysAtCostCopied,
    sourcePaysAtCost: source.paysAtCost,
  })

  return {
    success: true,
    copied,
    cleared,
    paysAtCostCopied,
    sourcePaysAtCost: source.paysAtCost,
  }
}
