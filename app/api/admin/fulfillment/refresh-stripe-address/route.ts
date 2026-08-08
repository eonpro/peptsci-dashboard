import { NextRequest } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import {
  requireAdmin,
  unauthorizedResponse,
  forbiddenResponse,
  errorResponse,
  successResponse,
} from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { getStripeClient } from '@/lib/stripe/config'
import { connectRequestOptions } from '@/lib/stripe/connect'
import { chargeFrom, customerFrom, invoiceForPaymentIntent } from '@/lib/stripe/sales-ingest'
import {
  isCompleteStripeAddr,
  isIncompletePlatformAddress,
  preferredShipAddress,
  resolveStripeAddresses,
  salesRecordAddressFields,
  toPlatformShippingAddress,
} from '@/lib/stripe/resolve-address'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    orderId: z.string().trim().min(1).optional(),
    orderNumber: z.coerce.number().int().positive().optional(),
    salesRecordId: z.string().trim().min(1).optional(),
    /** When true, overwrite Order.shippingAddress even if already set. */
    force: z.boolean().optional().default(false),
  })
  .refine((v) => Boolean(v.orderId || v.orderNumber || v.salesRecordId), {
    message: 'Provide orderId, orderNumber, or salesRecordId',
  })

/**
 * POST /api/admin/fulfillment/refresh-stripe-address
 *
 * Re-fetch address from Stripe for a converted (or queued) sale and write it
 * onto SalesRecord + Order.shippingAddress + Client shipping/billing (when
 * empty). Fixes orders converted before shipping was ingested (e.g. #199).
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, isAdmin } = await requireAdmin()
    if (!isAuthenticated) return unauthorizedResponse()
    if (!isAdmin) return forbiddenResponse('Admin access required')
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const stripe = getStripeClient()
    if (!stripe) return errorResponse('Stripe is not configured', 503, 'STRIPE_NOT_CONFIGURED')

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const { force } = parsed.data

    let salesRecord = parsed.data.salesRecordId
      ? await prisma.salesRecord.findUnique({ where: { id: parsed.data.salesRecordId } })
      : null

    let order =
      parsed.data.orderId || parsed.data.orderNumber
        ? await prisma.order.findFirst({
            where: parsed.data.orderId
              ? { id: parsed.data.orderId }
              : { orderNumber: parsed.data.orderNumber },
            select: {
              id: true,
              orderNumber: true,
              clientId: true,
              shippingAddress: true,
              stripePaymentIntentId: true,
            },
          })
        : null

    if (!salesRecord && order) {
      salesRecord = await prisma.salesRecord.findFirst({
        where: {
          OR: [
            { orderId: order.id },
            ...(order.stripePaymentIntentId
              ? [{ stripePaymentIntentId: order.stripePaymentIntentId }]
              : []),
          ],
        },
      })
    }

    if (!order && salesRecord?.orderId) {
      order = await prisma.order.findUnique({
        where: { id: salesRecord.orderId },
        select: {
          id: true,
          orderNumber: true,
          clientId: true,
          shippingAddress: true,
          stripePaymentIntentId: true,
        },
      })
    }

    const piId = salesRecord?.stripePaymentIntentId || order?.stripePaymentIntentId
    if (!piId) {
      return errorResponse('No Stripe PaymentIntent linked to this order/sale', 404, 'NO_PI')
    }

    const requestOptions = connectRequestOptions()
    const pi = await stripe.paymentIntents.retrieve(
      piId,
      { expand: ['latest_charge', 'customer'] },
      requestOptions
    )
    const charge = chargeFrom(pi)
    const customer = customerFrom(pi)
    const invoice = await invoiceForPaymentIntent(stripe, pi.id, requestOptions)
    const resolved = resolveStripeAddresses({ pi, charge, customer, invoice })
    const ship = preferredShipAddress(resolved)
    const bill = resolved.billing || resolved.shipping

    if (!isCompleteStripeAddr(ship)) {
      return errorResponse(
        'Stripe has no complete shipping/billing address for this payment',
        422,
        'NO_ADDRESS'
      )
    }

    const addrFields = salesRecordAddressFields(ship)
    const recipientName =
      invoice?.customer_shipping?.name ||
      pi.shipping?.name ||
      charge?.shipping?.name ||
      customer?.shipping?.name ||
      salesRecord?.customerName ||
      ''
    const recipientPhone =
      pi.shipping?.phone ||
      charge?.shipping?.phone ||
      customer?.shipping?.phone ||
      charge?.billing_details?.phone ||
      customer?.phone ||
      salesRecord?.customerPhone ||
      ''

    const orderShipping = toPlatformShippingAddress(ship!, {
      name: recipientName || undefined,
      phone: recipientPhone || undefined,
    })
    const billPlatform = bill && isCompleteStripeAddr(bill) ? toPlatformShippingAddress(bill) : orderShipping

    if (salesRecord) {
      await prisma.salesRecord.update({
        where: { id: salesRecord.id },
        data: {
          address: addrFields.address,
          address2: addrFields.address2,
          city: addrFields.city,
          state: addrFields.state,
          zip: addrFields.zip,
          ...(recipientName && !salesRecord.customerName
            ? { customerName: recipientName }
            : {}),
          ...(recipientPhone && !salesRecord.customerPhone
            ? { customerPhone: recipientPhone }
            : {}),
        },
      })
    }

    let orderUpdated = false
    if (order && (force || isIncompletePlatformAddress(order.shippingAddress))) {
      await prisma.order.update({
        where: { id: order.id },
        data: { shippingAddress: orderShipping as unknown as Prisma.InputJsonValue },
      })
      orderUpdated = true
    }

    let clientUpdated = false
    const clientId = order?.clientId
    if (clientId) {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { shippingAddress: true, billingAddress: true },
      })
      if (client) {
        const patch: Prisma.ClientUpdateInput = {}
        const coreShip = {
          address1: orderShipping.address1,
          ...(orderShipping.address2 ? { address2: orderShipping.address2 } : {}),
          city: orderShipping.city,
          state: orderShipping.state,
          zip: orderShipping.zip,
          country: orderShipping.country || 'US',
        }
        const coreBill = {
          address1: billPlatform.address1,
          ...(billPlatform.address2 ? { address2: billPlatform.address2 } : {}),
          city: billPlatform.city,
          state: billPlatform.state,
          zip: billPlatform.zip,
          country: billPlatform.country || 'US',
        }
        if (isIncompletePlatformAddress(client.shippingAddress)) {
          patch.shippingAddress = coreShip as unknown as Prisma.InputJsonValue
        }
        if (isIncompletePlatformAddress(client.billingAddress)) {
          patch.billingAddress = coreBill as unknown as Prisma.InputJsonValue
        }
        if (Object.keys(patch).length > 0) {
          await prisma.client.update({ where: { id: clientId }, data: patch })
          clientUpdated = true
        }
      }
    }

    logger.info('[refresh-stripe-address] applied', {
      piId,
      orderId: order?.id,
      orderNumber: order?.orderNumber,
      salesRecordId: salesRecord?.id,
      orderUpdated,
      clientUpdated,
      address: addrFields.address,
    })

    return successResponse({
      orderId: order?.id ?? null,
      orderNumber: order?.orderNumber ?? null,
      salesRecordId: salesRecord?.id ?? null,
      address: orderShipping,
      orderUpdated,
      clientUpdated,
    })
  } catch (error) {
    logger.error(
      '[refresh-stripe-address] error',
      {},
      error instanceof Error ? error : new Error(String(error))
    )
    return errorResponse('Failed to refresh address from Stripe')
  }
}
