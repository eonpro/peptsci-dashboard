/**
 * Prisma-backed creation of an admin ("manual") order.
 *
 * Shared by the Fulfillment "New Order" builder (POST /api/admin/orders) and the
 * Stripe → fulfillment conversion. Prices every line server-side (Model A) via
 * catalog SRP + the client's negotiated price, unless the caller passes an
 * explicit per-line override (used to match what a Stripe invoice actually
 * charged). Creates the Order + OrderItems only — it does NOT take payment,
 * reserve inventory, or sync analytics. Callers own those side effects:
 *   - manual order → charge via /orders/[id]/charge → reconcile reserves + syncs
 *   - stripe convert → reserve + sync explicitly (money already captured)
 */

import { Prisma, type OrderSource, type OrderStatus, type PaymentStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { computeCartTotals, type ShipSpeed, type ShipTo } from '@/lib/checkout-core'
import {
  buildManualOrderLines,
  validateManualLines,
  ManualOrderError,
  type ManualLineInput,
  type VariantPriceInfo,
} from './order-core'

export interface CreateManualOrderParams {
  clientId: string
  patientId?: string | null
  lines: ManualLineInput[] | unknown
  shipTo?: ShipTo
  shipSpeed?: ShipSpeed
  shippingAddress?: Prisma.InputJsonValue | null
  notes?: string | null
  internalNotes?: string | null
  /** DB User.id of the acting admin (resolved from Clerk id by the route). */
  createdById: string
  /** Defaults to SUBMITTED so the order is immediately visible on Fulfillment. */
  status?: OrderStatus
  /** Defaults to DIRECT. Stripe conversions pass STRIPE_INVOICE. */
  source?: OrderSource
  /** Defaults to PENDING. Stripe conversions pass CAPTURED (already paid). */
  paymentStatus?: PaymentStatus
  stripePaymentIntentId?: string | null
  stripeChargeId?: string | null
  paidAt?: Date | null
  /**
   * When set, the computed order total must match this amount (dollars) or the
   * creation is rejected. Used by Stripe conversions so a mapped order can
   * never diverge from what the customer actually paid.
   */
  expectedTotal?: number | null
}

export interface CreateManualOrderResult {
  id: string
  orderNumber: number
  subtotal: number
  shippingTotal: number
  total: number
  lineCount: number
}

/**
 * Create an order from admin-supplied line items. Validates + prices lines,
 * verifies the client exists, and persists the Order with its items in one
 * transaction. Throws {@link ManualOrderError} for any caller-fixable problem.
 */
export async function createManualOrder(
  params: CreateManualOrderParams
): Promise<CreateManualOrderResult> {
  if (!prisma) throw new Error('Database not connected')

  const clientId = params.clientId?.trim()
  if (!clientId) throw new ManualOrderError('A client is required', 'CLIENT_REQUIRED')

  const lines = validateManualLines(params.lines)

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
  if (!client) throw new ManualOrderError('Selected client was not found', 'CLIENT_UNKNOWN')

  if (params.patientId) {
    const patient = await prisma.patient.findFirst({
      where: { id: params.patientId, clientId },
      select: { id: true },
    })
    if (!patient) throw new ManualOrderError('Selected patient was not found for this client', 'PATIENT_UNKNOWN')
  }

  const variantIds = lines.map((l) => l.variantId)
  const variants = await prisma.productVariant.findMany({
    // Archived/discontinued SKUs are not orderable (matches resolveCart).
    where: { id: { in: variantIds }, status: 'ACTIVE' },
    include: {
      product: { select: { name: true } },
      clientPricing: {
        where: {
          clientId,
          isActive: true,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
            { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
          ],
        },
      },
    },
  })

  const info = new Map<string, VariantPriceInfo>()
  for (const v of variants) {
    info.set(v.id, {
      variantId: v.id,
      sku: v.sku,
      productName: v.product.name,
      dose: v.dose,
      srp: Number(v.srp),
      customPrice: v.clientPricing[0] ? Number(v.clientPricing[0].customPrice) : null,
    })
  }

  const resolvedLines = buildManualOrderLines(lines, info)
  const shipSpeed = params.shipSpeed ?? 'TWO_DAY'
  const totals = computeCartTotals(resolvedLines, shipSpeed)

  if (params.expectedTotal != null && Math.abs(totals.total - params.expectedTotal) > 0.005) {
    throw new ManualOrderError(
      `Order total $${totals.total.toFixed(2)} does not match the captured payment $${params.expectedTotal.toFixed(2)} — adjust line prices/quantities to match what was charged`,
      'TOTAL_MISMATCH'
    )
  }

  const order = await prisma.order.create({
    data: {
      clientId,
      source: params.source ?? 'DIRECT',
      status: params.status ?? 'SUBMITTED',
      paymentStatus: params.paymentStatus ?? 'PENDING',
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      shippingTotal: totals.shippingTotal,
      total: totals.total,
      currency: 'USD',
      notes: params.notes ?? null,
      internalNotes: params.internalNotes ?? null,
      shippingAddress: params.shippingAddress ?? Prisma.JsonNull,
      shipTo: params.shipTo ?? 'PRACTICE',
      shipSpeed,
      patientId: params.patientId ?? null,
      createdById: params.createdById,
      stripePaymentIntentId: params.stripePaymentIntentId ?? null,
      stripeChargeId: params.stripeChargeId ?? null,
      paidAt: params.paidAt ?? null,
      submittedAt: (params.status ?? 'SUBMITTED') !== 'DRAFT' ? new Date() : null,
      items: {
        create: resolvedLines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: 0,
          totalPrice: l.lineTotal,
        })),
      },
    },
    select: { id: true, orderNumber: true },
  })

  logger.info('[ADMIN ORDERS] Manual order created', {
    orderId: order.id,
    orderNumber: order.orderNumber,
    clientId,
    total: totals.total,
    lineCount: resolvedLines.length,
    source: params.source ?? 'DIRECT',
  })

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    subtotal: totals.subtotal,
    shippingTotal: totals.shippingTotal,
    total: totals.total,
    lineCount: resolvedLines.length,
  }
}
