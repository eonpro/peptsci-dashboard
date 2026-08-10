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
import { writeAudit } from '@/lib/audit'
import { StripeConfigError } from '@/lib/stripe/config'
import {
  linkStripeCustomerToClient,
  LinkStripeCustomerError,
} from '@/lib/stripe/link-customer'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/admin/clients/[id]/stripe — Stripe customer + saved-card snapshot.
 */
export async function GET(_request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        organizationName: true,
        stripeCustomerId: true,
        paymentMethods: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            stripePaymentMethodId: true,
            cardBrand: true,
            cardLast4: true,
            expiryMonth: true,
            expiryYear: true,
            cardholderName: true,
            isDefault: true,
            lastUsedAt: true,
          },
        },
      },
    })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    return successResponse({
      stripeCustomerId: client.stripeCustomerId,
      organizationName: client.organizationName,
      paymentMethods: client.paymentMethods,
    })
  } catch (error) {
    logger.error(
      '[ADMIN CLIENT STRIPE] get error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load Stripe profile')
  }
}

const linkSchema = z.object({
  stripeCustomerId: z.string().trim().min(5).max(64),
  /** Reassign if another Client already owns this Stripe customer. */
  force: z.boolean().optional(),
})

/**
 * POST /api/admin/clients/[id]/stripe — link an existing Stripe Customer and
 * sync its saved cards into PaymentMethod rows.
 *
 * Body: { stripeCustomerId: "cus_…", force?: boolean }
 */
export async function POST(request: NextRequest, context: Params) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const parsed = linkSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse('stripeCustomerId is required', 400, 'VALIDATION_ERROR')
    }

    const result = await linkStripeCustomerToClient({
      clientId: id,
      stripeCustomerId: parsed.data.stripeCustomerId,
      force: parsed.data.force,
      clerkUserId: userId,
    })

    void writeAudit({
      clerkUserId: userId,
      entity: 'Client',
      entityId: id,
      action: 'stripe_customer_linked',
      metadata: {
        stripeCustomerId: result.stripeCustomerId,
        previousClientId: result.previousClientId,
        cardsSynced: result.cardsSynced.length,
        customerEmail: result.customerEmail,
      },
    })

    return successResponse({ success: true, ...result })
  } catch (error) {
    if (error instanceof LinkStripeCustomerError) {
      return errorResponse(error.message, error.status, error.code)
    }
    if (error instanceof StripeConfigError) {
      return errorResponse(error.message, 503, error.code)
    }
    logger.error(
      '[ADMIN CLIENT STRIPE] link error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to link Stripe customer')
  }
}
