/**
 * POST /api/admin/clients/[id]/shopify/pull
 * Pull paid Shopify orders (recent or by name) and ingest into PeptSci.
 */

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
import { pullAndIngestShopifyOrders } from '@/lib/shopify/pull-orders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  /** e.g. "#1042" or "1042" — pull one order by name */
  orderName: z.string().trim().min(1).max(40).optional(),
  /** Look back N days for paid orders (default 3). Ignored when orderName set. */
  sinceDays: z.number().int().min(1).max(30).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message || 'Invalid input', 400, 'VALIDATION')
    }

    const conn = await prisma.shopifyConnection.findUnique({
      where: { clientId },
      select: {
        id: true,
        clientId: true,
        shopDomain: true,
        accessToken: true,
        apiVersion: true,
        status: true,
      },
    })
    if (!conn || conn.status !== 'ACTIVE') {
      return errorResponse('Active Shopify connection required', 404, 'NO_CONNECTION')
    }

    const pull = await pullAndIngestShopifyOrders({
      connection: conn,
      orderName: parsed.data.orderName,
      sinceDays: parsed.data.sinceDays ?? 3,
    })

    const firstErr = pull.results.find((r) => r.ingest.status === 'error')
    await prisma.shopifyConnection.update({
      where: { id: conn.id },
      data: {
        lastWebhookAt: new Date(),
        lastError:
          firstErr && firstErr.ingest.status === 'error'
            ? firstErr.ingest.message.slice(0, 500)
            : null,
      },
    })

    logger.info('[shopify] pull orders', {
      clientId,
      queried: pull.queried,
      results: pull.results.map((r) => ({
        name: r.shopifyOrderName,
        status: r.ingest.status,
      })),
    })

    return successResponse(pull)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('[shopify pull]', { message }, error instanceof Error ? error : undefined)
    return errorResponse(
      message.includes('GraphQL') || message.includes('Shopify')
        ? message
        : 'Failed to pull Shopify orders',
      message.includes('GraphQL') || message.includes('Shopify') ? 400 : 500,
      'PULL_FAILED'
    )
  }
}
