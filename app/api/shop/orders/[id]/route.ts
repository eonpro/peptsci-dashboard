import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveShopClientId } from '@/lib/shop-actor'
import { formatInvoiceNumber } from '@/lib/invoicing/core'

export const dynamic = 'force-dynamic'

/**
 * GET /api/shop/orders/[id] — order detail for the owning client, including
 * tracking and proof-of-shipment package photos. Photos are returned as proxied
 * URLs (/api/package-photos/[id]/image) which enforce the same ownership check.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const clientId = await resolveShopClientId(userId)
    if (!clientId) return errorResponse('No client account linked', 403, 'NO_CLIENT')

    const { id } = await params
    const order = await prisma.order.findFirst({
      where: { id, clientId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        shippingStatus: true,
        subtotal: true,
        taxTotal: true,
        shippingTotal: true,
        total: true,
        carrier: true,
        trackingNumber: true,
        trackingUrl: true,
        shippedAt: true,
        createdAt: true,
        submittedAt: true,
        approvedAt: true,
        fulfilledAt: true,
        shippingAddress: true,
        paymentStatus: true,
        paidAt: true,
        paymentMethod: { select: { cardBrand: true, cardLast4: true } },
        invoiceLineItems: {
          where: { invoice: { status: { not: 'VOID' } } },
          take: 1,
          select: {
            invoice: { select: { id: true, invoiceNumber: true, status: true, dueDate: true } },
          },
        },
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            variant: { select: { dose: true, sku: true, product: { select: { name: true } } } },
          },
        },
        packagePhotos: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, createdAt: true, notes: true },
        },
      },
    })

    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')

    // How the order was (or will be) paid, for the detail page.
    const invoice = order.invoiceLineItems[0]?.invoice ?? null
    const payment = {
      status: order.paymentStatus,
      paidAt: order.paidAt?.toISOString() ?? null,
      // "VISA ···· 4242" when a saved card is linked; null otherwise.
      card: order.paymentMethod?.cardLast4
        ? `${(order.paymentMethod.cardBrand ?? 'Card').toUpperCase()} ···· ${order.paymentMethod.cardLast4}`
        : null,
      invoice: invoice
        ? {
            id: invoice.id,
            number: formatInvoiceNumber(invoice.invoiceNumber),
            status: invoice.status,
            dueDate: invoice.dueDate?.toISOString() ?? null,
          }
        : null,
    }

    return successResponse({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        shippingStatus: order.shippingStatus,
        subtotal: Number(order.subtotal),
        taxTotal: Number(order.taxTotal),
        shippingTotal: Number(order.shippingTotal),
        total: Number(order.total),
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        shippedAt: order.shippedAt?.toISOString() ?? null,
        createdAt: order.createdAt.toISOString(),
        submittedAt: order.submittedAt?.toISOString() ?? null,
        approvedAt: order.approvedAt?.toISOString() ?? null,
        fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
        shippingAddress: order.shippingAddress,
        payment,
        items: order.items.map((it) => ({
          name: it.variant.product.name,
          dose: it.variant.dose,
          sku: it.variant.sku,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
          total: Number(it.totalPrice),
        })),
        packagePhotos: order.packagePhotos.map((p) => ({
          id: p.id,
          url: `/api/package-photos/${p.id}/image`,
          notes: p.notes,
          createdAt: p.createdAt.toISOString(),
        })),
      },
    })
  } catch (error) {
    logger.error('[shop/orders/:id] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to load order')
  }
}
