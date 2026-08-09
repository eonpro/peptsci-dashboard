/**
 * POST /api/admin/clients/[id]/shopify/inbounds/[inboundId]/match
 * Match an inbound line's Shopify product to a PeptSci variant, persist
 * ShopifyVariantMapping, and auto-process when fully mapped.
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
import { shopifyGidToNumeric } from '@/lib/shopify/ids'
import { inboundLinesFullyMapped } from '@/lib/shopify/inbound-core'
import { processShopifyInbound } from '@/lib/shopify/process-inbound'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  lineId: z.string().min(1),
  variantId: z.string().min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inboundId: string }> }
) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId, inboundId } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return errorResponse('lineId and variantId are required', 400, 'VALIDATION_ERROR')

    const inbound = await prisma.shopifyInboundOrder.findFirst({
      where: { id: inboundId, clientId },
      include: { lines: true },
    })
    if (!inbound) return errorResponse('Inbound order not found', 404, 'NOT_FOUND')
    if (inbound.status === 'CANCELLED' || inbound.status === 'FULFILLMENT_QUEUED') {
      return errorResponse('This inbound can no longer be matched', 409, 'LOCKED')
    }

    const line = inbound.lines.find((l) => l.id === parsed.data.lineId)
    if (!line) return errorResponse('Line not found', 404, 'LINE_NOT_FOUND')

    const variant = await prisma.productVariant.findFirst({
      where: { id: parsed.data.variantId, status: 'ACTIVE' },
      select: { id: true, sku: true },
    })
    if (!variant) return errorResponse('PeptSci variant not found', 404, 'VARIANT_NOT_FOUND')

    await prisma.shopifyInboundLine.update({
      where: { id: line.id },
      data: { variantId: variant.id },
    })

    // Persist mapping for future Shopify orders (prefer shopifyVariantId).
    const shopifyVariantId =
      (line.shopifyVariantId && (shopifyGidToNumeric(line.shopifyVariantId) || line.shopifyVariantId)) ||
      null
    if (shopifyVariantId) {
      await prisma.shopifyVariantMapping.upsert({
        where: {
          connectionId_shopifyVariantId: {
            connectionId: inbound.connectionId,
            shopifyVariantId,
          },
        },
        create: {
          connectionId: inbound.connectionId,
          shopifyVariantId,
          shopifySku: line.shopifySku,
          shopifyTitle: line.shopifyTitle,
          variantId: variant.id,
        },
        update: {
          shopifySku: line.shopifySku,
          shopifyTitle: line.shopifyTitle,
          variantId: variant.id,
        },
      })
    }

    const refreshed = await prisma.shopifyInboundLine.findMany({
      where: { inboundOrderId: inbound.id },
      select: { variantId: true },
    })

    let processResult = null
    if (inboundLinesFullyMapped(refreshed)) {
      processResult = await processShopifyInbound(inbound.id)
    } else {
      await prisma.shopifyInboundOrder.update({
        where: { id: inbound.id },
        data: { status: 'NEEDS_MAPPING', lastError: null },
      })
    }

    return successResponse({
      ok: true,
      fullyMapped: inboundLinesFullyMapped(refreshed),
      processResult,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Match failed'
    logger.error('[SHOPIFY MATCH] error', { message }, error as Error)
    return errorResponse(message)
  }
}
