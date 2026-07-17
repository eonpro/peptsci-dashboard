import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { consumeOrderInventoryTx } from '@/lib/fulfillment/service'
import {
  assessShipmentPaymentGate,
  PAYMENT_GATE_MESSAGE,
  PAYMENT_GATE_REFUNDED_MESSAGE,
} from '@/lib/fulfillment/payment-gate'
import { sendOrderShippedEmail, sendOrderDeliveredEmail } from '@/lib/email'
import { sendOrderShippedSms, sendOrderDeliveredSms } from '@/lib/sms'
import { resolveAdminUserId } from '@/lib/notifications/current-user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  /** SHIPPED = left via an outside carrier; DELIVERED = hand-delivered / picked up. */
  outcome: z.enum(['SHIPPED', 'DELIVERED']),
  carrier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
  /** Explicit admin acknowledgement to disposition an unpaid, un-invoiced order. */
  overrideUnpaidShip: z.boolean().default(false),
})

/** Best-effort public tracking URL for manually entered tracking numbers. */
function trackingUrlFor(carrier: string | undefined, trackingNumber: string): string | null {
  const c = (carrier ?? '').toLowerCase()
  if (c.includes('fedex') || /^\d{12,14}$/.test(trackingNumber)) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`
  }
  if (c.includes('ups') || trackingNumber.startsWith('1Z')) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`
  }
  if (c.includes('usps') || /^\d{20,22}$/.test(trackingNumber)) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`
  }
  if (c.includes('dhl')) {
    return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(trackingNumber)}`
  }
  return null
}

/**
 * POST /api/admin/orders/[id]/disposition — manually disposition an order that
 * was fulfilled OUTSIDE the in-app FedEx flow (shipped with another carrier or
 * an externally created label, hand-delivered, or picked up).
 *
 * Mirrors the FedEx label route's side effects so both paths leave identical
 * state: payment gate, SHIPPED status flip, inventory consume, SalesRecord
 * tracking mirror (clears the dashboard "Needs Fulfillment" badge), audit log,
 * and customer shipped/delivered email + SMS.
 *
 * Unlike the pre-ship FedEx path, inventory consume is BEST-EFFORT (no
 * requireFull): the goods have already physically left, so unmaintained batch
 * data must not block recording reality. Shortfalls are audit-logged.
 * Admin only.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { limited } = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
    if (limited) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED')

    const { id } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const input = parsed.data

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        trackingNumber: true,
        _count: { select: { invoiceLineItems: true } },
        client: {
          select: {
            contactEmail: true,
            contactName: true,
            contactPhone: true,
            smsOptIn: true,
            organizationName: true,
          },
        },
      },
    })
    if (!order) return errorResponse('Order not found', 404, 'NOT_FOUND')
    if (order.status === 'CANCELLED') {
      return errorResponse('This order is cancelled and cannot be dispositioned', 409, 'ORDER_CANCELLED')
    }

    // Pay-before-ship gate — same rule as the FedEx label path.
    const gate = assessShipmentPaymentGate({
      paymentStatus: order.paymentStatus,
      invoiced: order._count.invoiceLineItems > 0,
      override: input.overrideUnpaidShip,
    })
    if (!gate.allowed) {
      return gate.reason === 'refunded'
        ? errorResponse(PAYMENT_GATE_REFUNDED_MESSAGE, 409, 'ORDER_REFUNDED')
        : errorResponse(PAYMENT_GATE_MESSAGE, 402, 'PAYMENT_REQUIRED')
    }

    const dbUserId = await resolveAdminUserId(userId)
    if (gate.reason === 'override') {
      logger.warn('[disposition] unpaid-ship override used', {
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        userId: userId ?? null,
      })
      if (dbUserId) {
        await prisma.auditLog
          .create({
            data: {
              userId: dbUserId,
              entity: 'Order',
              entityId: order.id,
              action: 'unpaid_ship_override',
              orderId: order.id,
              metadata: { paymentStatus: order.paymentStatus, via: 'manual_disposition' },
            },
          })
          .catch(() => {})
      }
    }

    const trackingNumber = input.trackingNumber || null
    const trackingUrl = trackingNumber ? trackingUrlFor(input.carrier, trackingNumber) : null
    const carrier = input.carrier || (input.outcome === 'DELIVERED' && !trackingNumber ? 'Hand delivery' : 'Other')
    const now = new Date()

    let shortfall = 0
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          carrier,
          trackingNumber,
          trackingUrl,
          shippingStatus: input.outcome === 'DELIVERED' ? 'DELIVERED' : 'SHIPPED',
          shippedAt: now,
          // Reflect shipment on the order unless it's already terminal.
          ...(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_DOCUMENTS', 'APPROVED', 'FULFILLED'].includes(
            order.status
          )
            ? { status: 'SHIPPED' as const }
            : {}),
        },
      })

      // Best-effort draw (idempotent; no-op if already consumed via a label).
      const consumed = await consumeOrderInventoryTx(
        tx,
        order.id,
        { clerkUserId: userId && userId !== 'dev-user' ? userId : null, label: userId ?? null },
        { requireFull: false }
      )
      shortfall = consumed.shortfall

      // Keep the dashboard's "Needs Fulfillment" badge in step: SalesRecord
      // trackingNumber is a non-null string; use a readable marker when the
      // disposition has no tracking number.
      await tx.salesRecord.updateMany({
        where: { orderId: order.id },
        data: {
          trackingNumber:
            trackingNumber || (input.outcome === 'DELIVERED' ? 'Delivered (manual)' : 'Shipped (manual)'),
        },
      })

      await tx.auditLog.create({
        data: {
          userId: dbUserId,
          entity: 'Order',
          entityId: order.id,
          action: 'manual_disposition',
          orderId: order.id,
          metadata: {
            outcome: input.outcome,
            carrier,
            trackingNumber,
            notes: input.notes ?? null,
            inventoryShortfall: shortfall,
          },
        },
      })
    })

    if (shortfall > 0) {
      logger.warn('[disposition] consumed with batch shortfall', {
        orderId: order.id,
        shortfall,
      })
    }

    // Customer notifications — fire-and-forget, never fail the request.
    const email = order.client?.contactEmail ?? null
    const phone = order.client?.smsOptIn ? (order.client?.contactPhone ?? null) : null
    const customerName = order.client?.contactName || order.client?.organizationName || null
    if (input.outcome === 'DELIVERED') {
      if (email) {
        void sendOrderDeliveredEmail({
          to: email,
          customerName,
          orderNumber: order.orderNumber,
          trackingNumber: trackingNumber || '—',
          carrier,
        }).catch((e) =>
          logger.warn('[disposition] delivered email failed (non-blocking)', {
            orderId: order.id,
            error: e instanceof Error ? e.message : String(e),
          })
        )
      }
      if (phone && trackingNumber) {
        void sendOrderDeliveredSms({
          to: phone,
          orderNumber: order.orderNumber,
          trackingNumber,
          carrier,
        }).catch((e) =>
          logger.warn('[disposition] delivered SMS failed (non-blocking)', {
            orderId: order.id,
            error: e instanceof Error ? e.message : String(e),
          })
        )
      }
    } else if (trackingNumber) {
      if (email) {
        void sendOrderShippedEmail({
          to: email,
          customerName,
          orderNumber: order.orderNumber,
          trackingNumber,
          carrier,
        }).catch((e) =>
          logger.warn('[disposition] shipped email failed (non-blocking)', {
            orderId: order.id,
            error: e instanceof Error ? e.message : String(e),
          })
        )
      }
      if (phone) {
        void sendOrderShippedSms({
          to: phone,
          orderNumber: order.orderNumber,
          trackingNumber,
          carrier,
        }).catch((e) =>
          logger.warn('[disposition] shipped SMS failed (non-blocking)', {
            orderId: order.id,
            error: e instanceof Error ? e.message : String(e),
          })
        )
      }
    }

    logger.info('[disposition] order manually dispositioned', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      outcome: input.outcome,
      carrier,
      trackingNumber,
    })

    return successResponse({
      id: order.id,
      orderNumber: order.orderNumber,
      outcome: input.outcome,
      carrier,
      trackingNumber,
      trackingUrl,
      inventoryShortfall: shortfall,
    })
  } catch (error) {
    logger.error('[disposition] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to disposition order')
  }
}
