/**
 * Admin: Shopify Custom App connection for a Client.
 * GET/PUT/DELETE /api/admin/clients/[id]/shopify
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
import { encryptSecret, isEncryptionConfigured } from '@/lib/shopify/crypto'
import { normalizeShopDomain } from '@/lib/shopify/ids'

export const dynamic = 'force-dynamic'

const upsertSchema = z.object({
  shopDomain: z.string().trim().min(3).max(200),
  accessToken: z.string().trim().min(8).max(500).optional(),
  webhookSecret: z.string().trim().min(8).max(500).optional(),
  apiVersion: z.string().trim().min(4).max(20).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
})

function webhookUrlFor(connectionId: string, request: NextRequest): string {
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
  const origin = envBase || new URL(request.url).origin
  return `${origin}/api/webhooks/shopify/${connectionId}`
}

function serializeConnection(
  conn: {
    id: string
    clientId: string
    shopDomain: string
    apiVersion: string
    status: string
    lastWebhookAt: Date | null
    lastError: string | null
    createdAt: Date
    updatedAt: Date
    _count?: { mappings: number }
  },
  request: NextRequest
) {
  return {
    id: conn.id,
    clientId: conn.clientId,
    shopDomain: conn.shopDomain,
    apiVersion: conn.apiVersion,
    status: conn.status,
    lastWebhookAt: conn.lastWebhookAt,
    lastError: conn.lastError,
    mappingCount: conn._count?.mappings ?? undefined,
    webhookUrl: webhookUrlFor(conn.id, request),
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
    hasAccessToken: true,
    hasWebhookSecret: true,
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId } = await params
    const conn = await prisma.shopifyConnection.findUnique({
      where: { clientId },
      include: { _count: { select: { mappings: true } } },
    })
    if (!conn) return successResponse({ connection: null })
    return successResponse({ connection: serializeConnection(conn, request) })
  } catch (error) {
    logger.error('[shopify connection GET]', {}, error instanceof Error ? error : undefined)
    return errorResponse('Failed to load Shopify connection')
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')
    if (!isEncryptionConfigured()) {
      return errorResponse(
        'SHOPIFY_TOKEN_ENCRYPTION_KEY is not configured',
        400,
        'ENCRYPTION_NOT_CONFIGURED'
      )
    }

    const { id: clientId } = await params
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    const body = await request.json()
    const parsed = upsertSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message || 'Invalid input', 400, 'VALIDATION')
    }

    const shopDomain = normalizeShopDomain(parsed.data.shopDomain)
    const existing = await prisma.shopifyConnection.findUnique({ where: { clientId } })

    if (!existing && (!parsed.data.accessToken || !parsed.data.webhookSecret)) {
      return errorResponse(
        'accessToken and webhookSecret are required when creating a connection',
        400,
        'VALIDATION'
      )
    }

    const data: {
      shopDomain: string
      apiVersion?: string
      status?: 'ACTIVE' | 'DISABLED'
      accessToken?: string
      webhookSecret?: string
      lastError?: null
    } = {
      shopDomain,
      lastError: null,
    }
    if (parsed.data.apiVersion) data.apiVersion = parsed.data.apiVersion
    if (parsed.data.status) data.status = parsed.data.status
    if (parsed.data.accessToken) data.accessToken = encryptSecret(parsed.data.accessToken)
    if (parsed.data.webhookSecret) data.webhookSecret = encryptSecret(parsed.data.webhookSecret)

    const conn = existing
      ? await prisma.shopifyConnection.update({
          where: { clientId },
          data,
          include: { _count: { select: { mappings: true } } },
        })
      : await prisma.shopifyConnection.create({
          data: {
            clientId,
            shopDomain: data.shopDomain,
            accessToken: data.accessToken!,
            webhookSecret: data.webhookSecret!,
            apiVersion: data.apiVersion ?? '2025-07',
            status: data.status ?? 'ACTIVE',
          },
          include: { _count: { select: { mappings: true } } },
        })

    logger.info('[shopify] connection upserted', { clientId, connectionId: conn.id })
    return successResponse({ connection: serializeConnection(conn, request) })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('[shopify connection PUT]', { message }, error instanceof Error ? error : undefined)
    // Surface missing-table / migration failures clearly (common before migrate runs).
    if (/ShopifyConnection|does not exist|P2021|P2010/i.test(message)) {
      return errorResponse(
        'Shopify tables missing — apply pending DB migrations (Settings → Stripe → Database schema)',
        400,
        'MIGRATION_REQUIRED'
      )
    }
    return errorResponse('Failed to save Shopify connection')
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId } = await params
    const existing = await prisma.shopifyConnection.findUnique({ where: { clientId } })
    if (!existing) return errorResponse('No Shopify connection', 404, 'NOT_FOUND')

    await prisma.shopifyConnection.delete({ where: { clientId } })
    return successResponse({ deleted: true })
  } catch (error) {
    logger.error('[shopify connection DELETE]', {}, error instanceof Error ? error : undefined)
    return errorResponse('Failed to delete Shopify connection')
  }
}
