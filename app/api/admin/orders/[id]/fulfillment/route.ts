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
import {
  advanceFulfillment,
  completeFulfillment,
  completeWizardStep,
  getOrderFulfillment,
  startFulfillment,
} from '@/lib/fulfillment/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const verifiedItemsSchema = z.array(
  z.object({
    variantId: z.string(),
    productName: z.string(),
    expected: z.number().int().nonnegative(),
    packed: z.number().int().nonnegative(),
  })
)

/**
 * `start` / `step` / `complete` drive the guided wizard; `pick` / `pack` /
 * `reset` remain for the legacy inline actions (bulk Mark Picked, the
 * standalone photo modal) and are unchanged on the wire.
 *
 * Note REVIEW is not an accepted `step`: the final screen must go through
 * `complete` so there is exactly one path to marking an order fulfilled.
 */
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({
    action: z.literal('step'),
    step: z.enum(['VERIFY', 'VIAL_LABELS', 'PACKING_SLIP', 'PHOTO', 'SHIP']),
    manual: z.boolean().optional(),
    skipped: z.boolean().optional(),
    verifiedItems: verifiedItemsSchema.optional(),
  }),
  z.object({ action: z.literal('complete') }),
  z.object({
    action: z.enum(['pick', 'pack', 'reset']),
    verifiedItems: verifiedItemsSchema.optional(),
  }),
])

/** GET — current pick/pack state for an order. Admin only. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const fulfillment = await getOrderFulfillment(id)
    return successResponse({ fulfillment })
  } catch (error) {
    logger.error(
      '[admin/orders/fulfillment] GET error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to load fulfillment state')
  }
}

/** POST — advance pick → pack (or reset). Admin only. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse('Invalid request body', 400, 'INVALID_BODY')
    }

    const actor = userId ?? 'unknown'
    const input = parsed.data
    const fulfillment =
      input.action === 'start'
        ? await startFulfillment(id, actor)
        : input.action === 'step'
          ? await completeWizardStep(id, input.step, actor, {
              manual: input.manual,
              skipped: input.skipped,
              verifiedItems: input.verifiedItems,
            })
          : input.action === 'complete'
            ? await completeFulfillment(id, actor)
            : await advanceFulfillment(id, input.action, actor, input.verifiedItems)

    logger.info('[admin/orders/fulfillment] advanced', {
      orderId: id,
      action: input.action,
      ...(input.action === 'step' ? { step: input.step } : {}),
    })
    return successResponse({ fulfillment })
  } catch (error) {
    if (error instanceof Error && error.message === 'Order not found') {
      return errorResponse('Order not found', 404, 'NOT_FOUND')
    }
    logger.error(
      '[admin/orders/fulfillment] POST error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to update fulfillment state')
  }
}
