/**
 * Cancel an open (pre-ship) order: set CANCELLED, release reservations, reset
 * fulfillment stage, optionally void an unpaid invoice and refund the Stripe
 * charge. Shared by admin Fulfillment UI and Shopify orders/cancelled webhook.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { releaseForOrder } from '@/lib/inventory/reservations'
import { advanceFulfillment } from '@/lib/fulfillment/service'
import { voidInvoice } from '@/lib/invoicing/service'
import { issueOrderRefund, OrderRefundError } from '@/lib/orders/refund'
import { resolveOrderPaymentIntentId } from '@/lib/orders/payment-intent'
import { syncSalesRecordFromOrder } from '@/lib/sales'

export const ORDER_CANCEL_REASONS = [
  'wrong_compound',
  'client_cancelled',
  'duplicate',
  'address_issue',
  'stripe_refund',
  'other',
] as const

export type OrderCancelReason = (typeof ORDER_CANCEL_REASONS)[number]

export const ORDER_CANCEL_REASON_LABELS: Record<OrderCancelReason, string> = {
  wrong_compound: 'Wrong compound',
  client_cancelled: 'Client cancelled',
  duplicate: 'Duplicate',
  address_issue: 'Address issue',
  stripe_refund: 'Refunded on Stripe',
  other: 'Other',
}

export class OrderCancelError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'OrderCancelError'
  }
}

export type AssessOrderCancelInput = {
  status: string
  trackingNumber?: string | null
  shippingStatus?: string | null
}

export type AssessOrderCancelResult =
  | { allowed: true }
  | { allowed: false; code: 'ALREADY_CANCELLED' | 'ALREADY_SHIPPED'; message: string }

/** Pure guard — reject cancelled / shipped / labeled orders. */
export function assessOrderCancel(input: AssessOrderCancelInput): AssessOrderCancelResult {
  if (input.status === 'CANCELLED') {
    return {
      allowed: false,
      code: 'ALREADY_CANCELLED',
      message: 'This order is already cancelled.',
    }
  }
  if (
    input.trackingNumber ||
    input.status === 'SHIPPED' ||
    input.status === 'COMPLETED' ||
    input.shippingStatus === 'SHIPPED' ||
    input.shippingStatus === 'DELIVERED'
  ) {
    return {
      allowed: false,
      code: 'ALREADY_SHIPPED',
      message: 'This order has already shipped (or has a label) and cannot be cancelled here.',
    }
  }
  return { allowed: true }
}

/** Map cancel reason → Stripe refund reason when also refunding. */
export function stripeReasonForCancel(
  reason: OrderCancelReason
): 'requested_by_customer' | 'duplicate' | 'fraudulent' {
  if (reason === 'duplicate') return 'duplicate'
  return 'requested_by_customer'
}

export interface CancelOrderInput {
  reason: OrderCancelReason
  notes?: string | null
  /** When true and a Stripe PI is resolvable, issue a full remaining refund. */
  refund?: boolean
  /** Actor for audit / Stripe metadata (Clerk user id or system label). */
  cancelledBy?: string | null
  /** DB user id for AuditLog.userId (optional). */
  auditUserId?: string | null
  /** Appended note prefix, e.g. "Cancelled on Shopify". */
  notePrefix?: string | null
}

export interface CancelOrderResult {
  orderId: string
  orderNumber: number
  cancelReason: OrderCancelReason
  refunded: boolean
  refundAmount: number | null
  invoiceVoided: boolean
}

/**
 * Cancel a pre-ship order. Idempotent-ish: already-cancelled throws
 * ALREADY_CANCELLED so callers can distinguish noop vs success.
 */
export async function cancelOrder(
  orderId: string,
  input: CancelOrderInput
): Promise<CancelOrderResult> {
  if (!prisma) throw new OrderCancelError('Database not connected', 'DB_UNAVAILABLE', 503)
  if (!ORDER_CANCEL_REASONS.includes(input.reason)) {
    throw new OrderCancelError('Invalid cancel reason', 'INVALID_REASON', 400)
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      trackingNumber: true,
      shippingStatus: true,
      paymentStatus: true,
      internalNotes: true,
      invoiceLineItems: {
        select: { invoice: { select: { id: true, status: true } } },
        take: 5,
      },
      shopifyInbound: { select: { id: true, invoiceId: true, status: true } },
    },
  })
  if (!order) throw new OrderCancelError('Order not found', 'NOT_FOUND', 404)

  const gate = assessOrderCancel(order)
  if (!gate.allowed) {
    throw new OrderCancelError(gate.message, gate.code, 409)
  }

  const reasonLabel = ORDER_CANCEL_REASON_LABELS[input.reason]
  const noteParts = [
    input.notePrefix?.trim() || null,
    `Cancelled: ${reasonLabel}`,
    input.notes?.trim() || null,
  ].filter(Boolean)
  const cancelNote = noteParts.join(' — ')
  const internalNotes = order.internalNotes?.trim()
    ? `${order.internalNotes} | ${cancelNote}`
    : cancelNote
  const now = new Date()

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'CANCELLED',
      cancelReason: input.reason,
      cancelledAt: now,
      internalNotes,
    },
  })

  await releaseForOrder(order.id).catch((e) =>
    logger.warn('[cancel] releaseForOrder failed (non-blocking)', {
      orderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    })
  )

  // Reset pick/pack wizard so a stale PACKED stage does not linger.
  try {
    await advanceFulfillment(order.id, 'reset', input.auditUserId || input.cancelledBy || 'system')
  } catch (e) {
    logger.warn('[cancel] fulfillment reset failed (non-blocking)', {
      orderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // Mark Shopify inbound cancelled when present.
  if (order.shopifyInbound && order.shopifyInbound.status !== 'CANCELLED') {
    await prisma.shopifyInboundOrder
      .update({
        where: { id: order.shopifyInbound.id },
        data: { status: 'CANCELLED', lastError: cancelNote.slice(0, 500) },
      })
      .catch(() => {})
  }

  // Void unpaid linked invoices (paid invoices must be refunded, not voided).
  let invoiceVoided = false
  const invoiceIds = new Set<string>()
  for (const line of order.invoiceLineItems) {
    if (line.invoice.status !== 'PAID' && line.invoice.status !== 'VOID') {
      invoiceIds.add(line.invoice.id)
    }
  }
  if (
    order.shopifyInbound?.invoiceId &&
    !invoiceIds.has(order.shopifyInbound.invoiceId)
  ) {
    const inv = await prisma.invoice.findUnique({
      where: { id: order.shopifyInbound.invoiceId },
      select: { id: true, status: true },
    })
    if (inv && inv.status !== 'PAID' && inv.status !== 'VOID') {
      invoiceIds.add(inv.id)
    }
  }
  for (const invoiceId of invoiceIds) {
    try {
      await voidInvoice(invoiceId)
      invoiceVoided = true
    } catch (e) {
      logger.warn('[cancel] voidInvoice failed (non-blocking)', {
        orderId: order.id,
        invoiceId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  let refunded = false
  let refundAmount: number | null = null
  if (input.refund) {
    const resolved = await resolveOrderPaymentIntentId(order.id, { backfill: false })
    if (resolved.paymentIntentId && order.paymentStatus === 'CAPTURED') {
      try {
        const result = await issueOrderRefund(order.id, {
          reason: stripeReasonForCancel(input.reason),
          refundedBy: input.cancelledBy ?? null,
        })
        refunded = true
        refundAmount = result.amount
      } catch (e) {
        if (e instanceof OrderRefundError && e.code === 'ALREADY_REFUNDED') {
          // Fine — still cancelled.
        } else {
          // Cancel already committed; surface refund failure to caller.
          const message = e instanceof Error ? e.message : 'Refund failed after cancel'
          logger.error('[cancel] refund failed after cancel', { orderId: order.id, message })
          throw new OrderCancelError(
            `Order cancelled, but refund failed: ${message}`,
            'REFUND_FAILED_AFTER_CANCEL',
            e instanceof OrderRefundError ? e.status : 402
          )
        }
      }
    }
  }

  if (input.auditUserId) {
    await prisma.auditLog
      .create({
        data: {
          userId: input.auditUserId,
          entity: 'Order',
          entityId: order.id,
          action: 'cancel',
          orderId: order.id,
          metadata: {
            reason: input.reason,
            notes: input.notes ?? null,
            refund: Boolean(input.refund),
            refunded,
            refundAmount,
            invoiceVoided,
            cancelledBy: input.cancelledBy ?? null,
          },
        },
      })
      .catch(() => {})
  }

  // Keep analytics / dashboard in step (amounts + tracking). Status itself is
  // read live from Order in getSales — this sync covers refunded totals.
  await syncSalesRecordFromOrder(order.id).catch((e) =>
    logger.warn('[cancel] syncSalesRecordFromOrder failed (non-blocking)', {
      orderId: order.id,
      error: e instanceof Error ? e.message : String(e),
    })
  )

  logger.info('[cancel] order cancelled', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    reason: input.reason,
    refunded,
    refundAmount,
    by: input.cancelledBy ?? null,
  })

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    cancelReason: input.reason,
    refunded,
    refundAmount,
    invoiceVoided,
  }
}
