import { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { processStripeEvent } from '@/lib/stripe/webhook-processor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/webhook-events/[id]/retry — replay a dead-lettered webhook
 * event from its stored payload through the same processor the live webhook
 * uses. Only ERROR rows can be retried (SUCCESS is terminal; RECEIVED may be
 * in flight). All processors are idempotent, so a replay is safe even if the
 * original delivery partially succeeded.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id } = await params

    // Atomic claim: only one admin retry can move ERROR → RECEIVED.
    const claim = await prisma.webhookEvent.updateMany({
      where: { id, status: 'ERROR' },
      data: { status: 'RECEIVED', retryCount: { increment: 1 } },
    })
    if (claim.count === 0) {
      const existing = await prisma.webhookEvent.findUnique({
        where: { id },
        select: { status: true },
      })
      if (!existing) return errorResponse('Webhook event not found', 404, 'NOT_FOUND')
      return errorResponse(
        `Only failed events can be retried (this one is ${existing.status}).`,
        409,
        'NOT_RETRYABLE'
      )
    }

    const row = await prisma.webhookEvent.findUnique({ where: { id } })
    if (!row?.payload) {
      await prisma.webhookEvent.update({
        where: { id },
        data: { status: 'ERROR', errorMessage: 'No stored payload to replay' },
      })
      return errorResponse('This event has no stored payload to replay.', 409, 'NO_PAYLOAD')
    }

    const started = Date.now()
    let result
    try {
      result = await processStripeEvent(row.payload as unknown as Stripe.Event)
    } catch (err) {
      result = {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }

    await prisma.webhookEvent.update({
      where: { id },
      data: {
        status: result.success ? 'SUCCESS' : 'ERROR',
        errorMessage: result.error ?? null,
        processingMs: Date.now() - started,
        processedAt: result.success ? new Date() : null,
      },
    })

    logger.info('[WEBHOOK DLQ] Manual retry', {
      id,
      eventId: row.eventId,
      eventType: row.eventType,
      success: result.success,
      by: userId,
    })

    return successResponse({
      success: result.success,
      status: result.success ? 'SUCCESS' : 'ERROR',
      error: result.error ?? null,
      details: result.details ?? null,
    })
  } catch (error) {
    logger.error('[WEBHOOK DLQ] retry error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to retry webhook event')
  }
}
