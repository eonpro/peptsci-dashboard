import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { errorResponse, successResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * TEMPORARY secret-gated blend-product reorg — DELETE AFTER USE.
 *
 * Corrects the white-label COA modeling: Glow/Klow are single BLEND products
 * whose component peptides each have their own COA. This:
 *   1. upserts each blend product + one variant,
 *   2. reassigns component COAs (by taskNumber) to the blend variant,
 *   3. attaches other COAs to an existing variant (by SKU),
 *   4. deletes the orphaned per-peptide variants/products created earlier.
 *
 * Auth: `x-migrate-secret` === MIGRATE_RUNNER_SECRET (timing-safe, fails closed).
 */

function authorized(request: NextRequest): boolean {
  const secret = process.env.MIGRATE_RUNNER_SECRET
  if (!secret) return false
  const given = request.headers.get('x-migrate-secret') ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface Blend {
  productName: string
  category?: string
  variantSku: string
  variantDose?: string | null
  coaTasks: string[]
}
interface AttachExisting {
  variantSku: string
  coaTasks: string[]
}
interface Body {
  blends?: Blend[]
  attachExisting?: AttachExisting[]
  deleteVariantSkus?: string[]
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return errorResponse('Not found', 404, 'NOT_FOUND')
  if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')
  const db = prisma

  try {
    const body = (await request.json()) as Body
    const report: Record<string, unknown> = { blends: [], attachExisting: [], deleted: [] }

    // 1) Blend products: upsert product + one variant, then move component COAs.
    for (const b of body.blends ?? []) {
      let product = await db.product.findFirst({
        where: { name: { equals: b.productName, mode: 'insensitive' } },
        select: { id: true },
      })
      if (!product) {
        product = await db.product.create({
          data: { name: b.productName, category: b.category ?? 'Peptide Blends' },
          select: { id: true },
        })
      }
      let variant = await db.productVariant.findFirst({
        where: { sku: b.variantSku },
        select: { id: true },
      })
      if (!variant) {
        variant = await db.productVariant.create({
          data: {
            productId: product.id,
            sku: b.variantSku,
            dose: b.variantDose ?? null,
            unitCost: 0,
            srp: 0,
            status: 'ACTIVE',
          },
          select: { id: true },
        })
      }
      const moved: string[] = []
      for (const task of b.coaTasks) {
        const r = await db.productCoa.updateMany({
          where: { taskNumber: task },
          data: { variantId: variant.id },
        })
        moved.push(`${task}:${r.count}`)
      }
      ;(report.blends as unknown[]).push({
        productName: b.productName,
        productId: product.id,
        variantId: variant.id,
        variantSku: b.variantSku,
        movedCoas: moved,
      })
    }

    // 2) Attach COAs to an existing variant (e.g. the CP10 blend).
    for (const a of body.attachExisting ?? []) {
      const variant = await db.productVariant.findFirst({
        where: { sku: a.variantSku },
        select: { id: true },
      })
      if (!variant) {
        ;(report.attachExisting as unknown[]).push({ variantSku: a.variantSku, error: 'variant_not_found' })
        continue
      }
      const moved: string[] = []
      for (const task of a.coaTasks) {
        const r = await db.productCoa.updateMany({
          where: { taskNumber: task },
          data: { variantId: variant.id },
        })
        moved.push(`${task}:${r.count}`)
      }
      ;(report.attachExisting as unknown[]).push({ variantSku: a.variantSku, variantId: variant.id, movedCoas: moved })
    }

    // 3) Delete orphaned per-peptide variants (and their now-empty products).
    for (const sku of body.deleteVariantSkus ?? []) {
      try {
        const variant = await db.productVariant.findFirst({
          where: { sku },
          select: { id: true, productId: true, _count: { select: { coas: true, orderItems: true } } },
        })
        if (!variant) {
          ;(report.deleted as unknown[]).push({ sku, status: 'not_found' })
          continue
        }
        if (variant._count.orderItems > 0) {
          ;(report.deleted as unknown[]).push({ sku, status: 'skipped_has_orders' })
          continue
        }
        // Any COAs still on it would cascade-delete; guard so we never lose data.
        if (variant._count.coas > 0) {
          ;(report.deleted as unknown[]).push({ sku, status: 'skipped_has_coas', coas: variant._count.coas })
          continue
        }
        await db.productVariant.delete({ where: { id: variant.id } })
        const remaining = await db.productVariant.count({ where: { productId: variant.productId } })
        let productDeleted = false
        if (remaining === 0) {
          await db.product.delete({ where: { id: variant.productId } })
          productDeleted = true
        }
        ;(report.deleted as unknown[]).push({ sku, status: 'deleted', productDeleted })
      } catch (err) {
        ;(report.deleted as unknown[]).push({ sku, error: err instanceof Error ? err.message : String(err) })
      }
    }

    logger.info('[diag-fix-blends] complete', report)
    return successResponse(report)
  } catch (error) {
    logger.error('[diag-fix-blends] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse(error instanceof Error ? error.message : 'Fix failed')
  }
}
