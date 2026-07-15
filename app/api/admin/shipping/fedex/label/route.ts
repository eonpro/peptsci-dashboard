import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAdmin, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import {
  getCredentials,
  createShipment,
  cancelShipment,
  fedexTrackingUrl,
  fedexEnvironment,
} from '@/lib/fedex'
import { isValidServiceType, isValidPackagingType } from '@/lib/fedex-services'
import { fedexAddressSchema } from '@/lib/shipping/address'
import { putObject, getObject } from '@/lib/storage'
import {
  consumeOrderInventoryTx,
  InsufficientBatchStockError,
  reverseOrderConsume,
} from '@/lib/fulfillment/service'
import {
  assessShipmentPaymentGate,
  PAYMENT_GATE_MESSAGE,
  PAYMENT_GATE_REFUNDED_MESSAGE,
} from '@/lib/fulfillment/payment-gate'
import { sendOrderShippedEmail } from '@/lib/email'
import { sendOrderShippedSms } from '@/lib/sms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  orderId: z.string().optional(),
  origin: fedexAddressSchema,
  destination: fedexAddressSchema,
  serviceType: z.string().min(1),
  packagingType: z.string().default('YOUR_PACKAGING'),
  weightLbs: z.number().positive().max(150).default(1),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  oneRate: z.boolean().default(false),
  labelFormat: z.enum(['PDF', 'ZPLII', 'PNG']).default('PDF'),
  /** Explicit admin acknowledgement to ship an unpaid, un-invoiced order. */
  overrideUnpaidShip: z.boolean().default(false),
})

function classifyFedExError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const normalized = raw.toLowerCase()
  if (normalized.includes('timeout') || normalized.includes('temporarily')) {
    return { status: 503, message: 'FedEx is temporarily unavailable. Please try again shortly.' }
  }
  const statusMatch = raw.match(/FedEx API error:\s*(\d{3})/i)
  const upstream = statusMatch ? Number(statusMatch[1]) : null
  if (upstream === 400 || upstream === 404 || upstream === 422) {
    return {
      status: 422,
      message:
        'FedEx could not create this shipment with the provided address/package details. Please review and try again.',
    }
  }
  if (upstream === 401 || upstream === 403) {
    return { status: 503, message: 'FedEx credentials are invalid. Contact your administrator.' }
  }
  return { status: 502, message: 'Failed to create FedEx shipment. Please try again.' }
}

// ---------------------------------------------------------------------------
// POST — create a FedEx shipping label
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const { limited } = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.standard)
    if (limited) return errorResponse('Rate limit exceeded', 429, 'RATE_LIMITED')

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }
    const data = parsed.data

    if (!isValidServiceType(data.serviceType)) {
      return errorResponse(`Invalid service type: ${data.serviceType}`, 400, 'VALIDATION_ERROR')
    }
    if (!isValidPackagingType(data.packagingType)) {
      return errorResponse(`Invalid packaging type: ${data.packagingType}`, 400, 'VALIDATION_ERROR')
    }

    const credentials = getCredentials()
    if (!credentials) {
      return errorResponse('FedEx is not configured. Contact your administrator.', 422, 'FEDEX_UNCONFIGURED')
    }

    // Resolve the linked order (optional) to attach tracking + clientId, plus
    // the practice contact so we can email a shipment confirmation.
    let order:
      | {
          id: string
          clientId: string
          status: string
          paymentStatus: string
          orderNumber: number
          client: {
            contactEmail: string | null
            contactName: string | null
            contactPhone: string | null
            smsOptIn: boolean
            organizationName: string
          } | null
        }
      | null = null
    if (data.orderId) {
      const found = await prisma.order.findUnique({
        where: { id: data.orderId },
        select: {
          id: true,
          clientId: true,
          status: true,
          paymentStatus: true,
          orderNumber: true,
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
      if (!found) return errorResponse('Order not found', 404, 'NOT_FOUND')
      order = found

      // Pay-before-ship gate: never label/ship an unpaid order unless it is
      // invoiced (net terms) or the admin explicitly overrides (audit-logged).
      const gate = assessShipmentPaymentGate({
        paymentStatus: found.paymentStatus,
        invoiced: found._count.invoiceLineItems > 0,
        override: data.overrideUnpaidShip,
      })
      if (!gate.allowed) {
        return gate.reason === 'refunded'
          ? errorResponse(PAYMENT_GATE_REFUNDED_MESSAGE, 409, 'ORDER_REFUNDED')
          : errorResponse(PAYMENT_GATE_MESSAGE, 402, 'PAYMENT_REQUIRED')
      }
      if (gate.reason === 'override') {
        logger.warn('[FedEx label] unpaid-ship override used', {
          orderId: found.id,
          paymentStatus: found.paymentStatus,
          userId: userId ?? null,
        })
        if (userId && userId !== 'dev-user') {
          await prisma.auditLog
            .create({
              data: {
                userId,
                entity: 'Order',
                entityId: found.id,
                action: 'unpaid_ship_override',
                orderId: found.id,
                metadata: { paymentStatus: found.paymentStatus },
              },
            })
            .catch(() => {})
        }
      }
    }

    // Create the shipment at FedEx.
    let result
    try {
      result = await createShipment(credentials, {
        serviceType: data.serviceType,
        packagingType: data.packagingType,
        shipper: data.origin,
        recipient: data.destination,
        packages: [{ weightLbs: data.weightLbs, length: data.length, width: data.width, height: data.height }],
        oneRate: data.oneRate,
        labelFormat: data.labelFormat,
      })
    } catch (fedexErr) {
      const classified = classifyFedExError(fedexErr)
      logger.warn('[FedEx label] creation failed', {
        orderId: data.orderId ?? null,
        status: classified.status,
        environment: fedexEnvironment(),
        error: fedexErr instanceof Error ? fedexErr.message : String(fedexErr),
      })
      return errorResponse(classified.message, classified.status, 'FEDEX_ERROR')
    }

    // Store the label artifact (blob if configured, else base64 in-row).
    const ext = result.labelFormat === 'ZPLII' ? 'zpl' : result.labelFormat === 'PNG' ? 'png' : 'pdf'
    const contentType =
      result.labelFormat === 'PNG'
        ? 'image/png'
        : result.labelFormat === 'ZPLII'
          ? 'application/octet-stream'
          : 'application/pdf'
    const buffer = Buffer.from(result.labelPdfBase64, 'base64')
    const stored = await putObject(
      `shipping-labels/fedex-${result.trackingNumber}.${ext}`,
      buffer,
      contentType
    )

    const trackingUrl = fedexTrackingUrl(result.trackingNumber)

    // Label row, order SHIPPED flip, and inventory consume commit or roll back
    // TOGETHER — no more "SHIPPED with reservations still ACTIVE" (consume
    // failed after commit) or "shipped short but all reservations closed"
    // (requireFull draws all-or-nothing). If anything fails, the FedEx
    // shipment is cancelled so no orphan label exists at the carrier.
    let label
    try {
      label = await prisma.$transaction(async (tx) => {
        const created = await tx.shipmentLabel.create({
          data: {
            orderId: order?.id ?? null,
            clientId: order?.clientId ?? null,
            createdById: userId && userId !== 'dev-user' ? userId : null,
            carrier: 'FEDEX',
            trackingNumber: result.trackingNumber,
            shipmentId: result.shipmentId,
            serviceType: result.serviceType,
            originAddress: data.origin as unknown as Prisma.InputJsonValue,
            destinationAddress: data.destination as unknown as Prisma.InputJsonValue,
            weightLbs: data.weightLbs,
            length: data.length ?? null,
            width: data.width ?? null,
            height: data.height ?? null,
            labelFormat: result.labelFormat,
            labelBlobUrl: stored.url ?? null,
            labelPdfBase64: stored.base64 ?? null,
          },
        })

        if (order) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              carrier: 'FedEx',
              trackingNumber: result.trackingNumber,
              trackingUrl,
              shippingStatus: 'LABEL_CREATED',
              shippedAt: new Date(),
              // Reflect shipment on the order unless it's already terminal.
              ...(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'FULFILLED'].includes(order.status)
                ? { status: 'SHIPPED' as const }
                : {}),
            },
          })

          // Keep analytics in step: the dashboard's "Needs Fulfillment" badge
          // reads SalesRecord.trackingNumber, so mirror tracking onto the
          // linked row (tracking only — revenue/COGS stay owned by their
          // original writer, including Stripe-sourced records).
          await tx.salesRecord.updateMany({
            where: { orderId: order.id },
            data: { trackingNumber: result.trackingNumber },
          })

          // Idempotent — if the order was already consumed via the labels-PDF
          // path this is a no-op, so we never double-draw.
          await consumeOrderInventoryTx(
            tx,
            order.id,
            {
              clerkUserId: userId && userId !== 'dev-user' ? userId : null,
              label: userId ?? null,
            },
            { requireFull: true }
          )
        }

        return created
      })
    } catch (txErr) {
      // DB changes rolled back — cancel the already-created FedEx shipment so
      // it can't be used (best effort; FedEx labels also expire unused).
      try {
        await cancelShipment(credentials, result.trackingNumber)
      } catch (cancelErr) {
        logger.warn('[FedEx label] failed to cancel shipment after rollback', {
          trackingNumber: result.trackingNumber,
          error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
        })
      }
      if (txErr instanceof InsufficientBatchStockError) {
        return errorResponse(
          'Insufficient batch stock to fulfill this order — receive/adjust inventory before shipping.',
          409,
          'INSUFFICIENT_BATCH_STOCK'
        )
      }
      throw txErr
    }

    if (userId && userId !== 'dev-user') {
      await prisma.auditLog
        .create({
          data: {
            userId,
            entity: 'ShipmentLabel',
            entityId: label.id,
            action: 'fedex_label_created',
            orderId: order?.id ?? null,
            metadata: {
              trackingNumber: result.trackingNumber,
              serviceType: data.serviceType,
              environment: fedexEnvironment(),
            },
          },
        })
        .catch(() => {})
    }

    logger.info('FedEx label created', {
      labelId: label.id,
      orderId: order?.id ?? null,
      trackingNumber: result.trackingNumber,
      serviceType: data.serviceType,
      environment: fedexEnvironment(),
    })

    // Notify the practice that their order shipped. Fire-and-forget: a mail
    // failure must never fail label creation. No-ops when EMAIL_ENABLED is off.
    if (order?.client?.contactEmail) {
      void sendOrderShippedEmail({
        to: order.client.contactEmail,
        customerName: order.client.contactName || order.client.organizationName,
        orderNumber: order.orderNumber,
        trackingNumber: result.trackingNumber,
        carrier: 'FedEx',
      }).catch((err) =>
        logger.warn('[FedEx label] shipped email failed (non-blocking)', {
          orderId: order?.id ?? null,
          error: err instanceof Error ? err.message : String(err),
        })
      )
    }

    // Parallel SMS to the practice. Fire-and-forget; no-ops when SMS_ENABLED is
    // off, no phone is on file, or the client has not opted in (TCPA).
    if (order?.client?.contactPhone && order.client.smsOptIn) {
      void sendOrderShippedSms({
        to: order.client.contactPhone,
        orderNumber: order.orderNumber,
        trackingNumber: result.trackingNumber,
        carrier: 'FedEx',
      }).catch((err) =>
        logger.warn('[FedEx label] shipped SMS failed (non-blocking)', {
          orderId: order?.id ?? null,
          error: err instanceof Error ? err.message : String(err),
        })
      )
    }

    return successResponse({
      id: label.id,
      trackingNumber: result.trackingNumber,
      trackingUrl,
      serviceType: result.serviceType,
      labelData: result.labelPdfBase64,
      labelFormat: result.labelFormat,
      orderId: order?.id ?? null,
    })
  } catch (error) {
    logger.error('[FedEx label] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to create FedEx label')
  }
}

// ---------------------------------------------------------------------------
// GET — retrieve a stored label (?id=)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return errorResponse('Missing label id', 400, 'VALIDATION_ERROR')

    const label = await prisma.shipmentLabel.findUnique({ where: { id } })
    if (!label) return errorResponse('Label not found', 404, 'NOT_FOUND')
    if (label.status === 'VOIDED') return errorResponse('Label has been voided', 410, 'VOIDED')

    const stored = await getObject({
      url: label.labelBlobUrl,
      base64: label.labelPdfBase64,
      contentType: label.labelFormat === 'PNG' ? 'image/png' : 'application/pdf',
    })
    if (!stored) return errorResponse('Label artifact not available', 404, 'NOT_FOUND')

    return successResponse({
      id: label.id,
      trackingNumber: label.trackingNumber,
      serviceType: label.serviceType,
      labelData: stored.data.toString('base64'),
      labelFormat: label.labelFormat,
      createdAt: label.createdAt,
    })
  } catch (error) {
    logger.error('[FedEx label GET] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to retrieve label')
  }
}

// ---------------------------------------------------------------------------
// DELETE — void a label (?id=)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin, userId } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return errorResponse('Missing label id', 400, 'VALIDATION_ERROR')

    const label = await prisma.shipmentLabel.findUnique({ where: { id } })
    if (!label) return errorResponse('Label not found', 404, 'NOT_FOUND')
    if (label.status === 'VOIDED') return errorResponse('Label already voided', 400, 'ALREADY_VOIDED')

    const credentials = getCredentials()
    if (!credentials) return errorResponse('FedEx is not configured', 422, 'FEDEX_UNCONFIGURED')

    try {
      await cancelShipment(credentials, label.trackingNumber)
    } catch (fedexErr) {
      logger.warn('[FedEx label] void failed at FedEx', {
        labelId: label.id,
        error: fedexErr instanceof Error ? fedexErr.message : String(fedexErr),
      })
      // Continue to mark voided locally even if FedEx rejects (e.g. already shipped)
    }

    let lastActiveLabelVoided = false
    await prisma.$transaction(async (tx) => {
      await tx.shipmentLabel.update({
        where: { id: label.id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: userId && userId !== 'dev-user' ? userId : null,
        },
      })
      if (label.orderId) {
        // Multi-package orders: only clear tracking / roll status back when NO
        // other active label remains — otherwise point the order's tracking at
        // the latest remaining label.
        const otherActive = await tx.shipmentLabel.findFirst({
          where: { orderId: label.orderId, id: { not: label.id }, status: { not: 'VOIDED' } },
          orderBy: { createdAt: 'desc' },
        })
        if (otherActive) {
          await tx.order.update({
            where: { id: label.orderId },
            data: {
              trackingNumber: otherActive.trackingNumber,
              trackingUrl: fedexTrackingUrl(otherActive.trackingNumber),
              carrier: 'FedEx',
            },
          })
          await tx.salesRecord.updateMany({
            where: { orderId: label.orderId },
            data: { trackingNumber: otherActive.trackingNumber },
          })
          return
        }

        // Voiding the only label must not leave the order stuck in SHIPPED with
        // no tracking. Roll a SHIPPED order back to APPROVED (a pre-ship state)
        // and clear the shipped timestamp; other statuses are left untouched.
        lastActiveLabelVoided = true
        const linked = await tx.order.findUnique({
          where: { id: label.orderId },
          select: { status: true },
        })
        await tx.order.update({
          where: { id: label.orderId },
          data: {
            trackingNumber: null,
            trackingUrl: null,
            carrier: null,
            shippingStatus: null,
            ...(linked?.status === 'SHIPPED'
              ? { status: 'APPROVED' as const, shippedAt: null }
              : {}),
          },
        })
        // SalesRecord.trackingNumber is a non-null string ('' = no tracking),
        // so the dashboard badge flips back to "Needs Fulfillment".
        await tx.salesRecord.updateMany({
          where: { orderId: label.orderId },
          data: { trackingNumber: '' },
        })
      }
    })

    // The goods never left: restore the batch draws + variant on-hand recorded
    // at consume time and re-open the order's reservations, so voiding a
    // mistaken label doesn't permanently leak inventory. Idempotent.
    if (label.orderId && lastActiveLabelVoided) {
      try {
        const reversed = await reverseOrderConsume(label.orderId, {
          clerkUserId: userId && userId !== 'dev-user' ? userId : null,
          label: userId ?? null,
        })
        if (reversed.reversed) {
          logger.info('[FedEx label] consume reversed after void', {
            orderId: label.orderId,
            units: reversed.units,
          })
        }
      } catch (revErr) {
        logger.error('[FedEx label] consume reversal failed after void', {
          orderId: label.orderId,
          error: revErr instanceof Error ? revErr.message : String(revErr),
        })
      }
    }

    logger.info('FedEx label voided', { labelId: label.id, trackingNumber: label.trackingNumber })
    return successResponse({ success: true })
  } catch (error) {
    logger.error('[FedEx label DELETE] error', {}, error instanceof Error ? error : new Error(String(error)))
    return errorResponse('Failed to void label')
  }
}
