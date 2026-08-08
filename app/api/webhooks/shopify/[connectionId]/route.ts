/**
 * Shopify webhooks for a per-client Custom App connection.
 * POST /api/webhooks/shopify/[connectionId]
 *
 * Topics: orders/paid (ingest), orders/cancelled (cancel open PeptSci order).
 * Idempotent via WebhookEvent (eventId = X-Shopify-Webhook-Id).
 */

import { NextRequest, NextResponse } from 'next/server'
import { WebhookEventStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { decryptSecret } from '@/lib/shopify/crypto'
import { verifyShopifyWebhookHmac } from '@/lib/shopify/hmac'
import {
  cancelShopifyLinkedOrder,
  ingestShopifyPaidOrder,
  type ShopifyOrderPayload,
} from '@/lib/shopify/ingest-order'
import { shopifyGidToNumeric } from '@/lib/shopify/ids'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('Unique constraint') || message.includes('eventId')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const startTime = Date.now()
  const { connectionId } = await params

  if (!prisma) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const connection = await prisma.shopifyConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      clientId: true,
      status: true,
      webhookSecret: true,
    },
  })

  if (!connection || connection.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const rawBody = await request.text()
  let webhookSecret: string
  try {
    webhookSecret = decryptSecret(connection.webhookSecret)
  } catch {
    logger.error('[SHOPIFY WEBHOOK] Failed to decrypt webhook secret', { connectionId })
    return NextResponse.json({ error: 'Misconfigured connection' }, { status: 503 })
  }

  const hmac = request.headers.get('x-shopify-hmac-sha256')
  if (!verifyShopifyWebhookHmac(rawBody, webhookSecret, hmac)) {
    logger.warn('[SHOPIFY WEBHOOK] Invalid HMAC', { connectionId })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const topic = request.headers.get('x-shopify-topic') || 'unknown'
  const eventId =
    request.headers.get('x-shopify-webhook-id') ||
    request.headers.get('x-shopify-event-id') ||
    `shopify-${connectionId}-${Date.now()}`

  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(rawBody || '{}')
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const source = `shopify:${connectionId}`

  // Idempotency insert — unique on eventId globally (same as Stripe).
  try {
    await prisma.webhookEvent.create({
      data: {
        source,
        eventId,
        eventType: topic,
        status: WebhookEventStatus.RECEIVED,
        payload: rawBody.length < 100_000 ? (parsedPayload as object) : undefined,
      },
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    throw err
  }

  const payload = parsedPayload as ShopifyOrderPayload

  try {
    await prisma.shopifyConnection.update({
      where: { id: connectionId },
      data: { lastWebhookAt: new Date(), lastError: null },
    })

    if (topic === 'orders/paid' || topic === 'orders/create') {
      // Only ingest paid orders; orders/create may fire before payment.
      if (topic === 'orders/create' && payload.financial_status !== 'paid') {
        await prisma.webhookEvent.update({
          where: { eventId },
          data: {
            status: WebhookEventStatus.SUCCESS,
            processingMs: Date.now() - startTime,
            processedAt: new Date(),
          },
        })
        return NextResponse.json({ ok: true, skipped: 'not_paid' })
      }

      const result = await ingestShopifyPaidOrder({
        connectionId,
        clientId: connection.clientId,
        payload,
      })

      if (result.status === 'error') {
        await prisma.shopifyConnection.update({
          where: { id: connectionId },
          data: { lastError: result.message.slice(0, 500) },
        })
        await prisma.webhookEvent.update({
          where: { eventId },
          data: {
            status: WebhookEventStatus.ERROR,
            errorMessage: `${result.code}: ${result.message}`.slice(0, 1000),
            processingMs: Date.now() - startTime,
            processedAt: new Date(),
          },
        })
        // 200 so Shopify does not retry forever for mapping errors.
        return NextResponse.json({ ok: false, ...result })
      }

      await prisma.webhookEvent.update({
        where: { eventId },
        data: {
          status: WebhookEventStatus.SUCCESS,
          processingMs: Date.now() - startTime,
          processedAt: new Date(),
        },
      })
      return NextResponse.json({ ok: true, ...result })
    }

    if (topic === 'orders/cancelled') {
      const shopifyOrderId =
        shopifyGidToNumeric(payload.admin_graphql_api_id) ||
        shopifyGidToNumeric(payload.id) ||
        ''
      const result = await cancelShopifyLinkedOrder({
        clientId: connection.clientId,
        shopifyOrderId,
      })
      await prisma.webhookEvent.update({
        where: { eventId },
        data: {
          status: WebhookEventStatus.SUCCESS,
          processingMs: Date.now() - startTime,
          processedAt: new Date(),
        },
      })
      return NextResponse.json({ ok: true, ...result })
    }

    await prisma.webhookEvent.update({
      where: { eventId },
      data: {
        status: WebhookEventStatus.SUCCESS,
        processingMs: Date.now() - startTime,
        processedAt: new Date(),
      },
    })
    return NextResponse.json({ ok: true, skipped: 'unhandled_topic', topic })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('[SHOPIFY WEBHOOK] processing failed', { connectionId, topic, error: message })
    await prisma.webhookEvent
      .update({
        where: { eventId },
        data: {
          status: WebhookEventStatus.ERROR,
          errorMessage: message.slice(0, 1000),
          processingMs: Date.now() - startTime,
          processedAt: new Date(),
        },
      })
      .catch(() => {})
    // Transient → 503 so Shopify retries
    return NextResponse.json({ error: 'Processing failed' }, { status: 503 })
  }
}
