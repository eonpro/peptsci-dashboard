import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveCart, createDraftOrder } from '@/lib/stripe/checkout'
import { CartValidationError, MAX_SHOP_ITEM_QUANTITY } from '@/lib/checkout-core'
import { stockEnforcementEnabled } from '@/lib/stock-enforcement'
import { assessTermsCheckout } from '@/lib/checkout-terms'
import { createInvoice, getClientBillingSnapshot } from '@/lib/invoicing/service'
import { formatInvoiceNumber } from '@/lib/invoicing/core'
import { reserveForOrder } from '@/lib/inventory/reservations'
import { resolveShopActor } from '@/lib/shop-actor'
import { sendOrderConfirmationForOrder } from '@/lib/orders/confirmation-email'
import { sendInvoiceIssuedEmail } from '@/lib/email'
import { notifyAdmins } from '@/lib/notifications/service'
import { appUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'

const addressSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address1: z.string().optional(),
    address2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional(),
  })
  .passthrough()

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        quantity: z.number().int().min(1).max(MAX_SHOP_ITEM_QUANTITY),
      })
    )
    .min(1),
  shippingAddress: addressSchema.optional(),
  notes: z.string().max(500).optional(),
  shipTo: z.enum(['PRACTICE', 'PATIENT']).optional(),
  shipSpeed: z.enum(['TWO_DAY', 'OVERNIGHT']).optional(),
  // nullish, not optional: the checkout page always sends the field and it is
  // null when shipping to the practice.
  patientId: z.string().nullish(),
})

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

/**
 * POST /api/shop/checkout/terms — "bill to account" checkout for clients with
 * admin-granted net terms. No card is charged: the order is submitted with
 * paymentStatus PENDING and immediately invoiced on the client's terms, which
 * satisfies the pay-before-ship gate (invoiced = net-terms AR collects).
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) return unauthorizedResponse()

    const rl = await checkRateLimit(getRateLimitKey(request, userId), RATE_LIMITS.auth)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(rl.remaining, RATE_LIMITS.auth, rl.retryAfter) }
      )
    }
    if (!prisma) return errorResponse('Database not connected', 503, 'DB_UNAVAILABLE')

    const actor = await resolveShopActor(userId)
    if (!actor) return errorResponse('No client account is linked to your user', 403, 'NO_CLIENT')

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }
    const { items, shippingAddress, notes } = parsed.data
    const shipTo = parsed.data.shipTo ?? 'PRACTICE'
    const shipSpeed = parsed.data.shipSpeed ?? 'TWO_DAY'

    // Server-authoritative pricing (client-sent amounts are ignored).
    const cart = await resolveCart({
      clientId: actor.clientId,
      items,
      speed: shipSpeed,
      enforceStock: stockEnforcementEnabled(),
    })

    // Terms gate: admin-granted terms required; credit limit (when set) caps
    // open AR + this order. Both values are server-side only.
    const client = await prisma.client.findUnique({
      where: { id: actor.clientId },
      select: { paymentTermsDays: true, creditLimit: true, contactEmail: true, contactName: true, organizationName: true },
    })
    if (!client) return errorResponse('Client not found', 404, 'NOT_FOUND')

    const { openBalance, hasOverdue } = await getClientBillingSnapshot(actor.clientId)
    const gate = assessTermsCheckout({
      paymentTermsDays: client.paymentTermsDays,
      creditLimit: client.creditLimit != null ? Number(client.creditLimit) : null,
      openBalance,
      orderTotal: cart.totals.total,
      hasOverdue,
    })
    if (!gate.allowed) {
      if (gate.reason === 'NO_TERMS') {
        return errorResponse('Your account is not set up for billing on terms', 403, 'NO_TERMS')
      }
      if (gate.reason === 'CREDIT_HOLD') {
        return NextResponse.json(
          {
            error: 'Account on credit hold',
            message:
              'Your account has a past-due invoice. Please pay it at /shop/invoices (or use a card) to continue ordering on terms.',
            code: 'CREDIT_HOLD',
          },
          { status: 409 }
        )
      }
      return NextResponse.json(
        {
          error: 'Credit limit exceeded',
          message: `This order exceeds your available credit (${usd(gate.availableCredit)} available). Please pay open invoices or use a card.`,
          code: 'OVER_CREDIT_LIMIT',
          availableCredit: gate.availableCredit,
        },
        { status: 409 }
      )
    }

    // Resolve ship-to-patient server-side (mirrors the card checkout).
    let resolvedShippingAddress: Prisma.InputJsonValue | undefined =
      shippingAddress as Prisma.InputJsonValue | undefined
    let patientId: string | null = null
    if (shipTo === 'PATIENT') {
      if (!parsed.data.patientId) {
        return errorResponse('Select a patient to ship to', 400, 'PATIENT_REQUIRED')
      }
      const patient = await prisma.patient.findFirst({
        where: { id: parsed.data.patientId, clientId: actor.clientId, isActive: true },
      })
      if (!patient) return errorResponse('Patient not found', 404, 'PATIENT_NOT_FOUND')
      patientId = patient.id
      const addr = patient.address as Record<string, unknown> | null
      resolvedShippingAddress = {
        ...(addr ?? {}),
        firstName: patient.firstName,
        lastName: patient.lastName,
        phone: patient.phone ?? undefined,
      } as Prisma.InputJsonValue
    }

    const order = await createDraftOrder({
      clientId: actor.clientId,
      createdById: actor.userId,
      cart,
      shippingAddress: resolvedShippingAddress,
      notes,
      shipTo,
      shipSpeed,
      patientId,
    })

    // Submit the order (only from DRAFT — a reused draft may already be
    // submitted if the client double-clicked; both calls converge here).
    await prisma.order.updateMany({
      where: { id: order.id, status: 'DRAFT' },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    })

    // Invoice the order on the client's terms. If the order is already on a
    // non-void invoice (double-submit), reuse it instead of failing.
    let invoiceView
    const existingLine = await prisma.invoiceLineItem.findFirst({
      where: { orderId: order.id, invoice: { status: { not: 'VOID' } } },
      select: { invoiceId: true, invoice: { select: { invoiceNumber: true } } },
    })
    if (existingLine) {
      return successResponse({
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        invoiceId: existingLine.invoiceId,
        invoiceNumber: formatInvoiceNumber(existingLine.invoice.invoiceNumber),
        termsDays: gate.termsDays,
        duplicate: true,
      })
    }
    invoiceView = await createInvoice({
      clientId: actor.clientId,
      orderIds: [order.id],
      paymentTermsDays: gate.termsDays,
      createdById: actor.userId,
      notes: `Net-terms checkout — order #${order.orderNumber}`,
      issue: true,
    })

    // Reserve stock now that the order is committed (card orders reserve at
    // capture; terms orders reserve at submission). Non-blocking.
    await reserveForOrder(order.id).catch((e) =>
      logger.warn('[CHECKOUT TERMS] reserveForOrder failed (non-blocking)', {
        orderId: order.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )

    // Notifications (fire-and-forget; never fail the checkout).
    void sendOrderConfirmationForOrder(order.id, {
      paymentLabel: `Billed to account — Net ${gate.termsDays}`,
    })
    if (client.contactEmail) {
      void sendInvoiceIssuedEmail({
        to: client.contactEmail,
        customerName: client.contactName || client.organizationName,
        invoiceNumber: formatInvoiceNumber(invoiceView.invoice.invoiceNumber),
        amountDue: usd(invoiceView.totals.amountDue),
        dueDate: invoiceView.invoice.dueDate
          ? new Date(invoiceView.invoice.dueDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : '—',
        invoiceUrl: appUrl('/shop/invoices'),
      }).catch(() => {})
    }
    notifyAdmins({
      category: 'ORDER',
      priority: 'HIGH',
      title: `New order #${order.orderNumber} — ${usd(cart.totals.total)} (Net ${gate.termsDays})`,
      message: `${client.organizationName} placed order #${order.orderNumber} billed to account (invoice ${formatInvoiceNumber(invoiceView.invoice.invoiceNumber)}).`,
      actionUrl: '/fulfillment',
      sourceType: 'order:placed',
      sourceId: order.id,
      clientId: actor.clientId,
    }).catch((e) =>
      logger.warn('[CHECKOUT TERMS] admin notify failed (non-blocking)', {
        orderId: order.id,
        error: e instanceof Error ? e.message : String(e),
      })
    )

    logger.info('[CHECKOUT TERMS] Order billed to account', {
      orderId: order.id,
      invoiceId: invoiceView.invoice.id,
      clientId: actor.clientId,
      total: cart.totals.total,
      termsDays: gate.termsDays,
    })

    return successResponse({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      invoiceId: invoiceView.invoice.id,
      invoiceNumber: formatInvoiceNumber(invoiceView.invoice.invoiceNumber),
      termsDays: gate.termsDays,
    })
  } catch (error) {
    if (error instanceof CartValidationError) {
      logger.warn('[CHECKOUT TERMS] Cart rejected', { code: error.code, message: error.message })
      return errorResponse(error.message, 400, error.code)
    }
    const message = error instanceof Error ? error.message : 'Checkout failed'
    logger.error('[CHECKOUT TERMS] error', { message }, error as Error)
    return errorResponse(message)
  }
}
