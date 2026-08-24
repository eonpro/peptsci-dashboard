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
import {
  findBacWaterProduct,
  planBacWaterForProduct,
  upsertBacWaterSizes,
} from '@/lib/shop/bac-water-upsert'
import { planBacWaterVariants } from '@/lib/shop/bac-water-plan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin-only Bacteriostatic Water size upsert.
 *
 * Why: prod RDS is IAM + VPC only, so `scripts/upsert-bac-water.ts` can't
 * write. This runs the same shared upsert through the authenticated Vercel
 * runtime.
 *
 * Behavior:
 *  - GET:  dry-run — resolve the live product and report which of 3 mL / 10 mL /
 *          30 mL would be created vs updated. No writes.
 *  - POST: requires `{ confirm: true }`. Creates BAC-H2O-3ML ($5) and
 *          BAC-H2O-10ML ($10), retitles the leftover `BAC-H20` row to 30 mL
 *          ($20) keeping its SKU, and clears the peptide-only spec fields
 *          (purity / CAS / formula / MW) that don't apply to water.
 *
 * Idempotent — safe to re-run. SUPER_ADMIN only.
 */

export async function GET() {
  const { isAuthenticated, isAdmin } = await requireSuperAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse('Super-admin access required')
  if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

  try {
    const product = await findBacWaterProduct(prisma)
    const plan = product
      ? await planBacWaterForProduct(prisma, product.id)
      : planBacWaterVariants([])

    return successResponse({
      dryRun: true,
      product: product ? { id: product.id, name: product.name } : null,
      wouldCreateProduct: !product,
      wouldCreate: plan.filter((s) => s.action === 'create').length,
      wouldUpdate: plan.filter((s) => s.action === 'update').length,
      plan,
    })
  } catch (error) {
    logger.error(
      '[BAC WATER SIZES] preview error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Bacteriostatic water preview failed')
  }
}

export async function POST(request: NextRequest) {
  const { isAuthenticated, isAdmin, userId } = await requireSuperAdmin()
  if (!isAuthenticated) return unauthorizedResponse()
  if (!isAdmin) return forbiddenResponse('Super-admin access required')
  if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')

  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean }
  if (body?.confirm !== true) {
    return errorResponse('Confirmation required: POST { "confirm": true }', 400, 'CONFIRM_REQUIRED')
  }

  const start = Date.now()
  try {
    const result = await upsertBacWaterSizes(prisma)

    logger.info('[BAC WATER SIZES] upsert complete', {
      by: userId,
      productId: result.productId,
      productCreated: result.productCreated,
      createdCount: result.created.length,
      updatedCount: result.updated.length,
      durationMs: Date.now() - start,
    })

    return successResponse({
      product: { id: result.productId, name: result.productName },
      productCreated: result.productCreated,
      created: result.created,
      updated: result.updated,
      durationMs: Date.now() - start,
    })
  } catch (error) {
    logger.error(
      '[BAC WATER SIZES] upsert error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse(
      error instanceof Error ? error.message : 'Bacteriostatic water upsert failed'
    )
  }
}
