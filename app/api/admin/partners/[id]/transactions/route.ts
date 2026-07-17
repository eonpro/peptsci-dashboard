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
import { accrueManualTransaction, ManualAccrualError } from '@/lib/partners/accrual'
import { dollarsToCents } from '@/lib/partners/commission'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const manualSchema = z.object({
  clientId: z.string().trim().min(1),
  transactionDate: z.coerce.date(),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  reference: z.string().trim().max(120).optional().or(z.literal('')),
  /** Dollars (converted to integer cents server-side). */
  revenue: z.number().positive().max(10_000_000),
  cost: z.number().min(0).max(10_000_000).optional(),
})

const csvSchema = z.object({
  rows: z
    .array(
      z.object({
        clientEmail: z.string().trim().email().toLowerCase().optional(),
        clientId: z.string().trim().min(1).optional(),
        date: z.coerce.date(),
        description: z.string().trim().max(300).optional(),
        reference: z.string().trim().max(120).optional(),
        revenue: z.number().positive().max(10_000_000),
        cost: z.number().min(0).max(10_000_000).optional(),
      })
    )
    .min(1)
    .max(500),
})

/**
 * POST /api/admin/partners/[id]/transactions — record an off-platform revenue
 * event for an attributed clinic. Body is either a single manual entry or a
 * `{ rows: [...] }` CSV import batch (idempotent per non-empty reference).
 */
export async function POST(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin || !userId) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const body = await request.json()

    // ── CSV import batch ──
    if (Array.isArray(body?.rows)) {
      const parsed = csvSchema.safeParse(body)
      if (!parsed.success) {
        return errorResponse(
          parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          400,
          'VALIDATION_ERROR'
        )
      }

      let imported = 0
      let skipped = 0
      const failures: Array<{ row: number; error: string }> = []
      for (const [index, row] of parsed.data.rows.entries()) {
        try {
          let clientId = row.clientId
          if (!clientId && row.clientEmail) {
            const match = await prisma.client.findFirst({
              where: { partnerOrgId: id, contactEmail: { equals: row.clientEmail, mode: 'insensitive' } },
              select: { id: true },
            })
            clientId = match?.id
          }
          if (!clientId) {
            failures.push({ row: index + 1, error: 'No attributed clinic matched' })
            continue
          }
          const result = await accrueManualTransaction({
            orgId: id,
            clientId,
            transactionDate: row.date,
            description: row.description || null,
            reference: row.reference || null,
            revenueCents: dollarsToCents(row.revenue),
            costCents: row.cost !== undefined ? dollarsToCents(row.cost) : null,
            source: 'CSV',
            createdBy: userId,
          })
          if (result) imported += 1
          else skipped += 1
        } catch (err) {
          failures.push({
            row: index + 1,
            error: err instanceof ManualAccrualError ? err.message : 'Import failed',
          })
        }
      }
      logger.info('[ADMIN PARTNERS] CSV import', { orgId: id, imported, skipped, failed: failures.length })
      return successResponse({ imported, skipped, failures })
    }

    // ── Single manual entry ──
    const parsed = manualSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const data = parsed.data
    const result = await accrueManualTransaction({
      orgId: id,
      clientId: data.clientId,
      transactionDate: data.transactionDate,
      description: data.description || null,
      reference: data.reference || null,
      revenueCents: dollarsToCents(data.revenue),
      costCents: data.cost !== undefined ? dollarsToCents(data.cost) : null,
      source: 'MANUAL',
      createdBy: userId,
    })
    if (!result) {
      return errorResponse('A transaction with this reference already exists.', 409, 'DUPLICATE_REFERENCE')
    }
    return successResponse({ success: true, transactionId: result.transactionId }, 201)
  } catch (error) {
    if (error instanceof ManualAccrualError) {
      return errorResponse(error.message, error.status, error.code)
    }
    logger.error(
      'Error recording partner transaction',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to record transaction')
  }
}
