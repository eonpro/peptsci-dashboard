import { NextRequest } from 'next/server'
import {
  requireSuperAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import coaManifest from '@/lib/content/coa-manifest.json'
import blendReorg from '@/lib/content/coa-blend-reorg.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin-only COA backfill from `lib/content/coa-manifest.json`.
 *
 * Why: prod RDS is IAM+VPC-only, so CLI seeders can't write. This runs the
 * same structured COA upsert through the authenticated Vercel runtime.
 *
 * Behavior:
 *  - GET:  dry-run — resolve each manifest task to a live variant; report
 *          would-create / would-update / unresolved. No writes.
 *  - POST: requires `{ confirm: true }`. Upserts COAs by `taskNumber`
 *          (idempotent). Optionally reassigns blend component tasks onto
 *          GLOW / KLOW / CP10 via `lib/content/coa-blend-reorg.json`
 *          (`applyBlendReorg`, default true).
 *
 * Never creates missing products/variants — only attaches to the live catalog.
 * SUPER_ADMIN only.
 */

interface ManifestItem {
  taskNumber: string
  reportCode?: string
  productName: string
  sku: string
  doseLabel?: string
  doseMg?: number
  casNumber?: string
  batchNumber?: string
  orderedOn?: string
  receivedOn?: string
  analyzedOn?: string
  purityPercent?: number
  assayMeasuredMg?: number
  identity?: string
  signedBy?: string
}

interface ManifestCommon {
  issuingLab?: string
  testingLab?: string
  manufacturer?: string
  clientOfRecord?: string
  distributor?: string
  appearance?: string
  puritySpecMin?: number
  purityRejectMax?: number
}

function doseMag(s: string | null | undefined): number | null {
  const m = (s ?? '').match(/([\d.]+)/)
  return m ? parseFloat(m[1]) : null
}

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Map taskNumber → preferred blend / attach SKU from reorg config. */
function buildTaskTargetSkuMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const blend of blendReorg.blends ?? []) {
    for (const task of blend.coaTasks ?? []) {
      map.set(task, blend.variantSku)
    }
  }
  for (const attach of blendReorg.attachExisting ?? []) {
    for (const task of attach.coaTasks ?? []) {
      map.set(task, attach.variantSku)
    }
  }
  return map
}

type VariantHit = { id: string; sku: string; productName: string; dose: string | null }

async function loadVariants(): Promise<VariantHit[]> {
  if (!prisma) throw new Error('Database is not configured')
  const rows = await prisma.productVariant.findMany({
    select: {
      id: true,
      sku: true,
      dose: true,
      product: { select: { name: true } },
    },
    orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
  })
  return rows
    .filter((r): r is typeof r & { sku: string } => !!r.sku)
    .map((r) => ({
      id: r.id,
      sku: r.sku,
      productName: r.product.name,
      dose: r.dose,
    }))
}

function resolveVariant(
  item: ManifestItem,
  variants: VariantHit[],
  taskTargetSku: Map<string, string>
): { variant: VariantHit | null; how: string } {
  const preferredSku = taskTargetSku.get(item.taskNumber) ?? item.sku
  const bySku = variants.find((v) => v.sku === preferredSku)
  if (bySku) return { variant: bySku, how: preferredSku === item.sku ? 'sku' : 'blend-sku' }

  const byManifestSku = variants.find((v) => v.sku === item.sku)
  if (byManifestSku) return { variant: byManifestSku, how: 'sku' }

  const pn = norm(item.productName)
  let cands = variants.filter((v) => norm(v.productName) === pn)
  if (!cands.length) {
    cands = variants.filter(
      (v) => norm(v.productName).includes(pn) || pn.includes(norm(v.productName))
    )
  }
  const byDose =
    cands.find((c) => item.doseMg != null && doseMag(c.dose) === item.doseMg) ??
    cands.find((c) => norm(c.dose) === norm(item.doseLabel)) ??
    null
  if (byDose) return { variant: byDose, how: 'name+dose' }

  return { variant: null, how: 'unresolved' }
}

function buildCoaData(
  item: ManifestItem,
  variantId: string,
  common: ManifestCommon
) {
  return {
    variantId,
    compoundName: item.productName,
    doseLabel: item.doseLabel ?? null,
    casNumber: item.casNumber ?? null,
    appearance: common.appearance ?? null,
    batchNumber: item.batchNumber ?? null,
    taskNumber: item.taskNumber,
    reportCode: item.reportCode ?? null,
    issuingLab: common.issuingLab ?? null,
    signedBy: item.signedBy ?? null,
    manufacturer: common.manufacturer ?? null,
    testingLab: common.testingLab ?? null,
    clientOfRecord: common.clientOfRecord ?? null,
    distributor: common.distributor ?? null,
    orderedOn: item.orderedOn ? new Date(item.orderedOn) : null,
    receivedOn: item.receivedOn ? new Date(item.receivedOn) : null,
    analyzedOn: item.analyzedOn ? new Date(item.analyzedOn) : null,
    purityPercent: item.purityPercent ?? null,
    puritySpecMin: common.puritySpecMin ?? 98,
    purityRejectMax: common.purityRejectMax ?? 2,
    assayMeasuredMg: item.assayMeasuredMg ?? null,
    assayLabelClaimMg: item.doseMg ?? null,
    identitySpec: item.identity ?? null,
    identityResult: item.identity ?? null,
    published: true,
  }
}

async function planBackfill() {
  if (!prisma) throw new Error('Database is not configured')
  const common = (coaManifest.common ?? {}) as ManifestCommon
  const items = (coaManifest.items ?? []) as ManifestItem[]
  const variants = await loadVariants()
  const taskTargetSku = buildTaskTargetSkuMap()
  const existing = await prisma.productCoa.findMany({
    select: { id: true, taskNumber: true, variantId: true, casNumber: true },
  })
  const byTask = new Map(
    existing.filter((e) => e.taskNumber).map((e) => [e.taskNumber as string, e])
  )

  const plan = items.map((item) => {
    const { variant, how } = resolveVariant(item, variants, taskTargetSku)
    const row = byTask.get(item.taskNumber)
    let action: 'create' | 'update' | 'skip_unresolved' = 'skip_unresolved'
    if (variant) {
      action = row ? 'update' : 'create'
    }
    return {
      taskNumber: item.taskNumber,
      productName: item.productName,
      manifestSku: item.sku,
      doseMg: item.doseMg ?? null,
      resolveHow: how,
      targetSku: variant?.sku ?? null,
      targetVariantId: variant?.id ?? null,
      existingCoaId: row?.id ?? null,
      action,
    }
  })

  return { common, items, variants, taskTargetSku, plan }
}

export async function GET() {
  const { isAuthenticated, isAdmin } = await requireSuperAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse('Super-admin access required')

  try {
    const { plan } = await planBackfill()
    return successResponse({
      dryRun: true,
      scanned: plan.length,
      wouldCreate: plan.filter((p) => p.action === 'create').length,
      wouldUpdate: plan.filter((p) => p.action === 'update').length,
      unresolved: plan.filter((p) => p.action === 'skip_unresolved'),
      plan,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'COA backfill preview failed'
    logger.error('[COA BACKFILL] preview error', { message })
    return errorResponse(message)
  }
}

export async function POST(request: NextRequest) {
  const { isAuthenticated, isAdmin, userId } = await requireSuperAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse('Super-admin access required')

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: boolean
    applyBlendReorg?: boolean
  }
  if (body?.confirm !== true) {
    return errorResponse('Confirmation required: POST { "confirm": true }', 400, 'CONFIRM_REQUIRED')
  }
  if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

  const applyBlendReorg = body.applyBlendReorg !== false
  const start = Date.now()

  try {
    const { common, plan, variants, taskTargetSku } = await planBackfill()
    const results: Array<Record<string, unknown>> = []

    for (const step of plan) {
      if (step.action === 'skip_unresolved' || !step.targetVariantId) {
        results.push({
          taskNumber: step.taskNumber,
          action: 'skipped',
          reason: 'variant_not_found',
          manifestSku: step.manifestSku,
        })
        continue
      }

      const item = (coaManifest.items as ManifestItem[]).find(
        (i) => i.taskNumber === step.taskNumber
      )
      if (!item) continue

      const data = buildCoaData(item, step.targetVariantId, common)
      if (step.existingCoaId) {
        await prisma.productCoa.update({ where: { id: step.existingCoaId }, data })
        results.push({
          taskNumber: step.taskNumber,
          action: 'updated',
          coaId: step.existingCoaId,
          sku: step.targetSku,
          how: step.resolveHow,
        })
      } else {
        const created = await prisma.productCoa.create({
          data,
          select: { id: true },
        })
        results.push({
          taskNumber: step.taskNumber,
          action: 'created',
          coaId: created.id,
          sku: step.targetSku,
          how: step.resolveHow,
        })
      }
    }

    const reorgResults: Array<Record<string, unknown>> = []
    if (applyBlendReorg) {
      for (const [taskNumber, targetSku] of taskTargetSku.entries()) {
        const target = variants.find((v) => v.sku === targetSku)
        if (!target) {
          reorgResults.push({ taskNumber, action: 'reorg_skipped', reason: 'target_missing', targetSku })
          continue
        }
        const coa = await prisma.productCoa.findFirst({
          where: { taskNumber },
          select: { id: true, variantId: true },
        })
        if (!coa) {
          reorgResults.push({ taskNumber, action: 'reorg_skipped', reason: 'coa_missing', targetSku })
          continue
        }
        if (coa.variantId === target.id) {
          reorgResults.push({ taskNumber, action: 'reorg_noop', targetSku })
          continue
        }
        await prisma.productCoa.update({
          where: { id: coa.id },
          data: { variantId: target.id },
        })
        reorgResults.push({
          taskNumber,
          action: 'reorg_moved',
          coaId: coa.id,
          fromVariantId: coa.variantId,
          toSku: targetSku,
        })
      }
    }

    const createdCount = results.filter((r) => r.action === 'created').length
    const updatedCount = results.filter((r) => r.action === 'updated').length
    const skippedCount = results.filter((r) => r.action === 'skipped').length

    logger.info('[COA BACKFILL] run complete', {
      by: userId,
      createdCount,
      updatedCount,
      skippedCount,
      reorgMoved: reorgResults.filter((r) => r.action === 'reorg_moved').length,
      durationMs: Date.now() - start,
    })

    return successResponse({
      createdCount,
      updatedCount,
      skippedCount,
      results,
      reorgResults,
      durationMs: Date.now() - start,
    })
  } catch (error) {
    logger.error(
      '[COA BACKFILL] run error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse(error instanceof Error ? error.message : 'COA backfill failed')
  }
}
