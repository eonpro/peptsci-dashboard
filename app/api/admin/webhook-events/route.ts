import { NextRequest } from 'next/server'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/webhook-events — webhook delivery log / DLQ review.
 * ?status=ERROR|SUCCESS|RECEIVED|all (default ERROR), ?limit, ?cursor.
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const statusParam = request.nextUrl.searchParams.get('status') ?? 'ERROR'
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 50))
    const cursor = request.nextUrl.searchParams.get('cursor')

    const where =
      statusParam === 'all'
        ? {}
        : { status: statusParam as 'ERROR' | 'SUCCESS' | 'RECEIVED' }

    const events = await prisma.webhookEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        eventId: true,
        eventType: true,
        status: true,
        errorMessage: true,
        retryCount: true,
        processingMs: true,
        processedAt: true,
        createdAt: true,
      },
    })

    const hasMore = events.length > limit
    const page = hasMore ? events.slice(0, limit) : events

    const counts = await prisma.webhookEvent.groupBy({
      by: ['status'],
      _count: { _all: true },
    })

    return successResponse({
      events: page,
      nextCursor: hasMore ? page[page.length - 1]?.id : null,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    })
  } catch (error) {
    logger.error('[WEBHOOK DLQ] list error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load webhook events')
  }
}
