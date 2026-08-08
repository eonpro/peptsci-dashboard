/**
 * Admin: Shopify ↔ PeptSci variant mappings for a client connection.
 * GET/PUT /api/admin/clients/[id]/shopify/mappings
 * POST .../match-sku — bulk suggest/apply by SKU
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
import { decryptSecret } from '@/lib/shopify/crypto'
import { listShopifyProductVariants } from '@/lib/shopify/client'
import { shopifyGidToNumeric } from '@/lib/shopify/ids'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const mappingItemSchema = z.object({
  shopifyVariantId: z.string().trim().min(1).max(120),
  shopifySku: z.string().trim().max(120).nullable().optional(),
  shopifyTitle: z.string().trim().max(300).nullable().optional(),
  variantId: z.string().trim().min(1).max(60),
})

const putSchema = z.object({
  mappings: z.array(mappingItemSchema).max(500),
})

async function getActiveConnection(clientId: string) {
  if (!prisma) return null
  return prisma.shopifyConnection.findUnique({
    where: { clientId },
    select: {
      id: true,
      shopDomain: true,
      accessToken: true,
      apiVersion: true,
      status: true,
    },
  })
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId } = await params
    const conn = await getActiveConnection(clientId)
    if (!conn) return errorResponse('Connect Shopify first', 404, 'NO_CONNECTION')

    const [mappings, shopifyVariants, peptsciVariants] = await Promise.all([
      prisma.shopifyVariantMapping.findMany({
        where: { connectionId: conn.id },
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              dose: true,
              product: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      (async () => {
        try {
          return await listShopifyProductVariants({
            shopDomain: conn.shopDomain,
            accessToken: decryptSecret(conn.accessToken),
            apiVersion: conn.apiVersion,
          })
        } catch (err) {
          logger.warn('[shopify mappings] list variants failed', {
            clientId,
            error: err instanceof Error ? err.message : String(err),
          })
          return []
        }
      })(),
      prisma.productVariant.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          sku: true,
          dose: true,
          product: { select: { name: true } },
        },
        orderBy: [{ product: { name: 'asc' } }, { dose: 'asc' }],
      }),
    ])

    return successResponse({
      connectionId: conn.id,
      mappings: mappings.map((m) => ({
        id: m.id,
        shopifyVariantId: m.shopifyVariantId,
        shopifySku: m.shopifySku,
        shopifyTitle: m.shopifyTitle,
        variantId: m.variantId,
        variant: {
          id: m.variant.id,
          sku: m.variant.sku,
          dose: m.variant.dose,
          productName: m.variant.product.name,
        },
      })),
      shopifyVariants: shopifyVariants.map((v) => ({
        id: shopifyGidToNumeric(v.id) || v.id,
        gid: v.id,
        sku: v.sku,
        title: v.displayName || v.title || v.product?.title || null,
      })),
      peptsciVariants: peptsciVariants.map((v) => ({
        id: v.id,
        sku: v.sku,
        dose: v.dose,
        productName: v.product.name,
        label: `${v.product.name}${v.dose ? ` ${v.dose}` : ''}${v.sku ? ` (${v.sku})` : ''}`,
      })),
    })
  } catch (error) {
    logger.error('[shopify mappings GET]', {}, error instanceof Error ? error : undefined)
    return errorResponse('Failed to load mappings')
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId } = await params
    const conn = await getActiveConnection(clientId)
    if (!conn) return errorResponse('Connect Shopify first', 404, 'NO_CONNECTION')

    const body = await request.json()
    const parsed = putSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message || 'Invalid input', 400, 'VALIDATION')
    }

    const variantIds = parsed.data.mappings.map((m) => m.variantId)
    const found = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true },
    })
    const foundSet = new Set(found.map((v) => v.id))
    for (const m of parsed.data.mappings) {
      if (!foundSet.has(m.variantId)) {
        return errorResponse(`Unknown PeptSci variant ${m.variantId}`, 400, 'VARIANT_UNKNOWN')
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.shopifyVariantMapping.deleteMany({ where: { connectionId: conn.id } })
      if (parsed.data.mappings.length) {
        await tx.shopifyVariantMapping.createMany({
          data: parsed.data.mappings.map((m) => ({
            connectionId: conn.id,
            shopifyVariantId: shopifyGidToNumeric(m.shopifyVariantId) || m.shopifyVariantId,
            shopifySku: m.shopifySku ?? null,
            shopifyTitle: m.shopifyTitle ?? null,
            variantId: m.variantId,
          })),
        })
      }
    })

    return successResponse({ saved: parsed.data.mappings.length })
  } catch (error) {
    logger.error('[shopify mappings PUT]', {}, error instanceof Error ? error : undefined)
    return errorResponse('Failed to save mappings')
  }
}
