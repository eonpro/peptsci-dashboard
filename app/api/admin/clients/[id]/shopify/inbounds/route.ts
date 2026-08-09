/**
 * GET /api/admin/clients/[id]/shopify/inbounds
 * List Shopify inbound orders needing mapping or unpaid invoices.
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

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { id: clientId } = await params
    const inbounds = await prisma.shopifyInboundOrder.findMany({
      where: {
        clientId,
        status: { in: ['NEEDS_MAPPING', 'READY', 'INVOICED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        lines: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            shopifyVariantId: true,
            shopifySku: true,
            shopifyTitle: true,
            quantity: true,
            variantId: true,
            variant: {
              select: {
                id: true,
                sku: true,
                dose: true,
                product: { select: { name: true } },
              },
            },
          },
        },
        invoice: {
          select: { id: true, invoiceNumber: true, status: true },
        },
      },
    })

    return successResponse({
      inbounds: inbounds.map((row) => ({
        id: row.id,
        shopifyOrderId: row.shopifyOrderId,
        shopifyOrderName: row.shopifyOrderName,
        status: row.status,
        shipSpeed: row.shipSpeed,
        lastError: row.lastError,
        createdAt: row.createdAt.toISOString(),
        invoice: row.invoice
          ? {
              id: row.invoice.id,
              invoiceNumber: row.invoice.invoiceNumber,
              status: row.invoice.status,
            }
          : null,
        lines: row.lines.map((l) => ({
          id: l.id,
          shopifyVariantId: l.shopifyVariantId,
          shopifySku: l.shopifySku,
          shopifyTitle: l.shopifyTitle,
          quantity: l.quantity,
          variantId: l.variantId,
          mappedLabel: l.variant
            ? `${l.variant.product.name}${l.variant.dose ? ` ${l.variant.dose}` : ''} (${l.variant.sku})`
            : null,
        })),
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list inbounds'
    logger.error('[SHOPIFY INBOUNDS] list error', { message }, error as Error)
    return errorResponse(message)
  }
}
