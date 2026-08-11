import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveAdminUserId } from '@/lib/notifications/current-user'
import {
  cancelOrder,
  OrderCancelError,
  ORDER_CANCEL_REASONS,
} from '@/lib/orders/cancel'
import { StripeConfigError } from '@/lib/stripe/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  reason: z.enum(ORDER_CANCEL_REASONS),
  notes: z.string().trim().max(1000).optional(),
  /** Default true — refund PeptSci Stripe charge when resolvable. */
  refund: z.boolean().optional().default(true),
})

/**
 * POST /api/admin/orders/[id]/cancel — cancel fulfillment before ship.
 *
 * Sets CANCELLED, releases reservations, resets fulfillment stage, voids
 * unpaid invoices, and optionally refunds the Stripe / invoice PaymentIntent.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { limited } = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
    if (limited) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED')

    const { id } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const auditUserId = await resolveAdminUserId(userId)
    const result = await cancelOrder(id, {
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      refund: parsed.data.refund,
      cancelledBy: userId ?? null,
      auditUserId,
    })
    return successResponse(result)
  } catch (error) {
    if (error instanceof OrderCancelError) {
      return errorResponse(error.message, error.status, error.code)
    }
    if (error instanceof StripeConfigError) {
      return errorResponse('Payments are not configured', 503, error.code)
    }
    logger.error('[CANCEL] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to cancel order')
  }
}
