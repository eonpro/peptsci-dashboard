import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { putObject } from '@/lib/storage'
import { errorResponse, successResponse } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * TEMPORARY secret-gated COA bulk seeder — DELETE AFTER USE.
 *
 * Why: the authenticated admin browser channel used to create COAs is not
 * available, and prod RDS is IAM+VPC-only (no CLI). This applies COA records
 * (and, in a second pass, their source JPGs) through the live runtime
 * connection. Same auth/idempotency posture as /api/diag-migrate.
 *
 * Auth: `x-migrate-secret` header must equal MIGRATE_RUNNER_SECRET. Fails
 * closed when unset.
 *
 * Modes:
 *   GET                      → probe: existing variants + seeded COA task numbers
 *   POST application/json    → seed records: { common, items[], createMissing }
 *   POST multipart/form-data → attach file: fields `taskNumber` + `file`
 */

const MAX_FILE_SIZE = 12 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']

function authorized(request: NextRequest): boolean {
  const secret = process.env.MIGRATE_RUNNER_SECRET
  if (!secret) return false
  const given = request.headers.get('x-migrate-secret') ?? ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Parse the numeric magnitude (mg/iu/etc.) from a dose string. */
function doseMag(s: string | null | undefined): number | null {
  const m = (s ?? '').match(/([\d.]+)/)
  return m ? parseFloat(m[1]) : null
}

interface SeedItem {
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
  category?: string
}

interface Common {
  issuingLab?: string
  testingLab?: string
  manufacturer?: string
  clientOfRecord?: string
  distributor?: string
  appearance?: string
  puritySpecMin?: number
  purityRejectMax?: number
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return errorResponse('Not found', 404, 'NOT_FOUND')
  if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')
  try {
    const variants = await prisma.productVariant.findMany({
      select: { id: true, sku: true, dose: true, product: { select: { name: true } } },
      orderBy: [{ product: { name: 'asc' } }],
    })
    const coas = await prisma.productCoa.findMany({ select: { taskNumber: true } })
    return successResponse({
      variantCount: variants.length,
      variants: variants.map((v) => ({ id: v.id, sku: v.sku, name: v.product.name, dose: v.dose })),
      seededTaskNumbers: coas.map((c) => c.taskNumber).filter(Boolean).sort(),
    })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Probe failed')
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return errorResponse('Not found', 404, 'NOT_FOUND')
  if (!prisma) return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')
  const db = prisma

  const contentType = request.headers.get('content-type') || ''

  // ── Mode B: attach a source file to an existing COA (by taskNumber). ──
  if (contentType.includes('multipart/form-data')) {
    try {
      const form = await request.formData()
      const taskNumber = String(form.get('taskNumber') || '')
      const file = form.get('file') as File | null
      if (!taskNumber) return errorResponse('taskNumber required', 400, 'VALIDATION_ERROR')
      if (!file || file.size === 0) return errorResponse('file required', 400, 'VALIDATION_ERROR')
      if (!ALLOWED_MIME.includes(file.type)) return errorResponse(`bad type ${file.type}`, 400, 'VALIDATION_ERROR')
      if (file.size > MAX_FILE_SIZE) return errorResponse('file too large', 400, 'VALIDATION_ERROR')

      const coa = await db.productCoa.findFirst({ where: { taskNumber }, select: { id: true, variantId: true } })
      if (!coa) return errorResponse(`No COA for task ${taskNumber}`, 404, 'NOT_FOUND')

      const buffer = Buffer.from(await file.arrayBuffer())
      const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      const stored = await putObject(`product-coas/${coa.variantId}-${taskNumber}.${ext}`, buffer, file.type)
      await db.productCoa.update({
        where: { id: coa.id },
        data: {
          fileUrl: stored.url ?? null,
          fileBase64: stored.base64 ?? null,
          contentType: file.type,
          fileName: file.name,
        },
      })
      return successResponse({ taskNumber, attached: true, driver: stored.driver })
    } catch (error) {
      logger.error('[diag-seed-coa attach] error', {}, error instanceof Error ? error : new Error(String(error)))
      return errorResponse(error instanceof Error ? error.message : 'Attach failed')
    }
  }

  // ── Mode A: seed COA records from JSON manifest. ──
  try {
    const body = (await request.json()) as { common?: Common; items?: SeedItem[]; createMissing?: boolean }
    const common = body.common ?? {}
    const items = body.items ?? []
    const createMissing = body.createMissing !== false

    const results: Array<Record<string, unknown>> = []

    for (const item of items) {
      try {
        // Resolve the variant: exact SKU, else compound-name + dose match.
        let variant = await db.productVariant.findFirst({
          where: { sku: item.sku },
          select: { id: true, productId: true },
        })

        if (!variant) {
          const candidates = await db.productVariant.findMany({
            where: { product: { name: { equals: item.productName, mode: 'insensitive' } } },
            select: { id: true, productId: true, dose: true },
          })
          // Match by numeric dose magnitude (catalog stores "5.0mg", COA "5 mg").
          variant =
            candidates.find(
              (c) => item.doseMg != null && doseMag(c.dose) === item.doseMg
            ) ??
            candidates.find((c) => norm(c.dose) === norm(item.doseLabel)) ??
            null
        }

        let created = false
        if (!variant) {
          if (!createMissing) {
            results.push({ taskNumber: item.taskNumber, skipped: 'variant_not_found' })
            continue
          }
          let product = await db.product.findFirst({
            where: { name: { equals: item.productName, mode: 'insensitive' } },
            select: { id: true },
          })
          if (!product) {
            product = await db.product.create({
              data: {
                name: item.productName,
                category: item.category ?? 'Peptides',
                casNumber: item.casNumber ?? null,
              },
              select: { id: true },
            })
          }
          // Ensure SKU uniqueness.
          const skuTaken = await db.productVariant.findFirst({ where: { sku: item.sku }, select: { id: true } })
          const sku = skuTaken ? `${item.sku}-${item.taskNumber}` : item.sku
          const newVariant = await db.productVariant.create({
            data: {
              productId: product.id,
              sku,
              dose: item.doseLabel ?? null,
              unitCost: 0,
              srp: 0,
              status: 'ACTIVE',
            },
            select: { id: true, productId: true },
          })
          variant = newVariant
          created = true
        }

        // Idempotent by taskNumber.
        const existing = await db.productCoa.findFirst({
          where: { taskNumber: item.taskNumber },
          select: { id: true },
        })

        const data = {
          variantId: variant.id,
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

        if (existing) {
          await db.productCoa.update({ where: { id: existing.id }, data })
          results.push({ taskNumber: item.taskNumber, action: 'updated', variantId: variant.id, createdVariant: created })
        } else {
          const c = await db.productCoa.create({ data, select: { id: true } })
          results.push({ taskNumber: item.taskNumber, action: 'created', coaId: c.id, variantId: variant.id, createdVariant: created })
        }
      } catch (err) {
        results.push({ taskNumber: item.taskNumber, error: err instanceof Error ? err.message : String(err) })
      }
    }

    const createdCount = results.filter((r) => r.action === 'created').length
    const updatedCount = results.filter((r) => r.action === 'updated').length
    const errorCount = results.filter((r) => r.error).length
    logger.info('[diag-seed-coa] run complete', { createdCount, updatedCount, errorCount })
    return successResponse({ createdCount, updatedCount, errorCount, results })
  } catch (error) {
    logger.error('[diag-seed-coa] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse(error instanceof Error ? error.message : 'Seed failed')
  }
}
