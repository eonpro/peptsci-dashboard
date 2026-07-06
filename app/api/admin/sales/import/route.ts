import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { parseSalesCsv, type RowError } from '@/lib/sales-import'
import { buildCostLookup, estimateUnitCost } from '@/lib/sales'
import { coerceDate } from '@/lib/csv-coerce'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Large CSVs are processed row-by-row (each row idempotent, no giant
// transaction), so allow up to 5 minutes.
export const maxDuration = 300

const bodySchema = z.object({
  csv: z.string().min(1, 'csv is required'),
  validateOnly: z.boolean().optional(),
})

interface ImportSummary {
  totalRows: number
  /** Rows actually attempted against the DB (progress even on partial runs). */
  processed: number
  created: number
  updated: number
  failed: number
  validateOnly: boolean
  errors: RowError[]
}

/** Stripe PaymentIntent ids look like `pi_...`. */
const STRIPE_PI_RE = /^pi_[A-Za-z0-9]+$/

/**
 * Deterministic synthetic externalId for CSV rows without an orderId, so
 * re-importing the same file updates in place instead of duplicating.
 */
function syntheticExternalId(row: {
  customerName?: string
  product?: string
  date?: string
  paidAmount: number
  vials: number
}): string {
  const fingerprint = [
    (row.customerName ?? '').trim().toLowerCase(),
    (row.product ?? '').trim().toLowerCase(),
    (row.date ?? '').trim(),
    String(row.paidAmount),
    String(row.vials),
  ].join('|')
  return `csv:${createHash('sha256').update(fingerprint).digest('hex')}`
}

/**
 * POST /api/admin/sales/import
 *
 * Bulk-import historical sales rows from CSV text into SalesRecord.
 * Body: { csv: string, validateOnly?: boolean }
 *
 * Dedup: every row is upserted on a stable unique key (see the dedupe
 * precedence comment in the row loop), so re-imports and re-runs after a
 * timeout update in place instead of duplicating. COGS is taken from the CSV
 * when present, else computed from unitCost*vials, else estimated from the
 * catalog (35% fallback). Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')

    if (!prisma) {
      return errorResponse('Database is not configured', 503, 'DB_UNAVAILABLE')
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const { csv, validateOnly = false } = parsed.data
    const { rows, errors } = parseSalesCsv(csv)

    const summary: ImportSummary = {
      totalRows: rows.length + errors.length,
      processed: 0,
      created: 0,
      updated: 0,
      failed: errors.length,
      validateOnly,
      errors: [...errors],
    }

    const hasStructuralError = errors.some((e) => e.rowNumber === 1 && rows.length === 0)
    if (hasStructuralError) {
      return errorResponse(errors[0]?.message || 'Invalid CSV', 400, 'VALIDATION_ERROR')
    }

    if (validateOnly) {
      return successResponse(summary)
    }

    const costLookup = await buildCostLookup()

    // Dedupe precedence — SalesRecord has three unique keys written by three
    // sources (orderId: platform order sync, stripePaymentIntentId: Stripe
    // backfill, externalId: CSV). To keep one row per real sale:
    //   1. If the CSV orderId looks like a Stripe PaymentIntent id (`pi_...`)
    //      or matches an existing SalesRecord.stripePaymentIntentId, upsert on
    //      stripePaymentIntentId so the Stripe backfill and CSV land on the
    //      SAME row instead of creating a parallel externalId row.
    //   2. Otherwise, rows with an orderId upsert by externalId = orderId.
    //   3. Rows without an orderId upsert by a deterministic synthetic
    //      externalId (`csv:` + hash of customerName|product|date|paid|vials)
    //      so re-importing the same file updates instead of duplicating.
    // Each row is idempotent, so a re-run after a timeout is safe.
    for (const row of rows) {
      summary.processed++
      try {
        const product = row.product ?? ''
        const vials = row.vials
        const amountPerVial = row.amountPerVial || (vials > 0 ? row.paidAmount / vials : 0)

        let cogs = row.cogs
        if (cogs === undefined) {
          const unit =
            row.unitCost !== undefined
              ? row.unitCost
              : estimateUnitCost(product, amountPerVial, costLookup)
          cogs = unit * vials
        }
        const unitCost = row.unitCost ?? (vials > 0 ? cogs / vials : 0)

        const data = {
          date: coerceDate(row.date),
          orderRef: row.orderId ?? '',
          customerName: row.customerName ?? '',
          customerEmail: row.customerEmail ?? '',
          customerPhone: row.customerPhone ?? '',
          address: row.address ?? '',
          city: row.city ?? '',
          state: row.state ?? '',
          zip: row.zip ?? '',
          trackingNumber: row.trackingNumber ?? '',
          // Respect an explicit invoicePaid value (including paidAmount = 0);
          // fall back to `paidAmount > 0` only when the flag is truly absent.
          invoicePaid: row.invoicePaid ?? row.paidAmount > 0,
          paidAmount: row.paidAmount,
          vials,
          amountPerVial,
          product,
          notes: row.notes ?? '',
          unitCost,
          cogs,
          source: 'csv',
        }

        // Resolve which unique key this row upserts on (precedence above).
        let where: { stripePaymentIntentId: string } | { externalId: string }
        if (row.orderId && STRIPE_PI_RE.test(row.orderId)) {
          where = { stripePaymentIntentId: row.orderId }
        } else if (
          row.orderId &&
          (await prisma.salesRecord.findUnique({
            where: { stripePaymentIntentId: row.orderId },
            select: { id: true },
          }))
        ) {
          where = { stripePaymentIntentId: row.orderId }
        } else {
          where = { externalId: row.orderId ?? syntheticExternalId(row) }
        }

        const existing = await prisma.salesRecord.findUnique({ where, select: { id: true } })
        await prisma.salesRecord.upsert({
          where,
          create: { ...where, ...data },
          update: data,
        })
        if (existing) summary.updated++
        else summary.created++
      } catch (rowErr) {
        summary.failed++
        summary.errors.push({
          rowNumber: row.rowNumber,
          message: rowErr instanceof Error ? rowErr.message : 'Failed to import row',
        })
      }
    }

    logger.info('Sales CSV import completed', {
      by: userId,
      created: summary.created,
      updated: summary.updated,
      failed: summary.failed,
    })

    return successResponse(summary)
  } catch (error) {
    logger.error(
      'Error importing sales',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to import sales')
  }
}
