/**
 * POST /api/admin/clients/[id]/shopify/mappings/match-sku
 * Auto-map Shopify variants to PeptSci variants by matching SKU (case-insensitive).
 */

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
import { decryptSecret } from '@/lib/shopify/crypto'
import { listShopifyProductVariants } from '@/lib/shopify/client'
import { shopifyGidToNumeric } from '@/lib/shopify/ids'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId } = await params
    const apply = new URL(request.url).searchParams.get('apply') === '1'

    const conn = await prisma.shopifyConnection.findUnique({
      where: { clientId },
      select: { id: true, shopDomain: true, accessToken: true, apiVersion: true },
    })
    if (!conn) return errorResponse('Connect Shopify first', 404, 'NO_CONNECTION')

    const [shopifyVariants, peptsciVariants, existing] = await Promise.all([
      listShopifyProductVariants({
        shopDomain: conn.shopDomain,
        accessToken: decryptSecret(conn.accessToken),
        apiVersion: conn.apiVersion,
      }),
      prisma.productVariant.findMany({
        where: { status: 'ACTIVE', sku: { not: null } },
        select: { id: true, sku: true },
      }),
      prisma.shopifyVariantMapping.findMany({
        where: { connectionId: conn.id },
        select: { shopifyVariantId: true },
      }),
    ])

    const bySku = new Map<string, string>()
    for (const v of peptsciVariants) {
      if (v.sku?.trim()) bySku.set(v.sku.trim().toLowerCase(), v.id)
    }

    const already = new Set(existing.map((e) => e.shopifyVariantId))
    const suggestions: Array<{
      shopifyVariantId: string
      shopifySku: string
      shopifyTitle: string | null
      variantId: string
    }> = []

    for (const sv of shopifyVariants) {
      const sku = sv.sku?.trim()
      if (!sku) continue
      const variantId = bySku.get(sku.toLowerCase())
      if (!variantId) continue
      const id = shopifyGidToNumeric(sv.id) || sv.id
      if (already.has(id)) continue
      suggestions.push({
        shopifyVariantId: id,
        shopifySku: sku,
        shopifyTitle: sv.displayName || sv.title || sv.product?.title || null,
        variantId,
      })
    }

    if (apply && suggestions.length) {
      await prisma.shopifyVariantMapping.createMany({
        data: suggestions.map((s) => ({
          connectionId: conn.id,
          shopifyVariantId: s.shopifyVariantId,
          shopifySku: s.shopifySku,
          shopifyTitle: s.shopifyTitle,
          variantId: s.variantId,
        })),
        skipDuplicates: true,
      })
    }

    return successResponse({
      matched: suggestions.length,
      applied: apply,
      suggestions,
    })
  } catch (error) {
    logger.error('[shopify match-sku]', {}, error instanceof Error ? error : undefined)
    return errorResponse('Failed to match SKUs')
  }
}
