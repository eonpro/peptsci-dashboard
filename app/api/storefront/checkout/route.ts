import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { errorResponse, successResponse } from '@/lib/auth'
import { getStorefrontBySlug, createRetailOrder } from '@/lib/storefront'
import { checkRateLimit, getRateLimitKey, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const addressSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  address1: z.string().min(1),
  address2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().default('US'),
})

const checkoutSchema = z.object({
  slug: z.string().min(1),
  email: z.string().email(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        storefrontProductId: z.string().min(1),
        quantity: z.number().int().min(1).max(999),
      })
    )
    .min(1),
  endCustomerToken: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    // Public, unauthenticated endpoint that creates real orders and reserves
    // real inventory — throttle hard per IP to blunt bot/spam abuse.
    const { limited, remaining, retryAfter } = await checkRateLimit(
      getRateLimitKey(request),
      RATE_LIMITS.publicCheckout
    )
    if (limited) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        { status: 429, headers: getRateLimitHeaders(remaining, RATE_LIMITS.publicCheckout, retryAfter) }
      )
    }

    const body = await request.json()
    const parsed = checkoutSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
        400,
        'VALIDATION_ERROR'
      )
    }

    const { slug, email, shippingAddress, billingAddress, notes, items, endCustomerToken } =
      parsed.data

    const config = await getStorefrontBySlug(slug)
    if (!config || config.status !== 'ACTIVE') {
      return errorResponse('Storefront not found or inactive', 404, 'NOT_FOUND')
    }

    if (!prisma) return errorResponse('Database not connected')

    // Resolve end customer (from token or guest). The token is bound to a
    // storefront — reject a token minted for a DIFFERENT storefront so an
    // order on storefront B can't be attached to storefront A's customer.
    let endCustomerId: string | undefined
    if (endCustomerToken) {
      const { verifyEndCustomerToken } = await import('@/lib/end-customer-auth')
      const payload = verifyEndCustomerToken(endCustomerToken)
      if (payload && payload.storefrontId === config.id) {
        endCustomerId = payload.endCustomerId
      } else if (payload) {
        logger.warn('Storefront checkout token/storefront mismatch', {
          tokenStorefrontId: payload.storefrontId,
          checkoutStorefrontId: config.id,
        })
        return errorResponse('Session does not belong to this storefront', 403, 'STOREFRONT_MISMATCH')
      }
    }

    // If not logged in, try to find or create a guest end customer.
    // Only reuse an existing record when it is itself a guest account —
    // attaching a guest order to a REGISTERED account matched by email alone
    // would let anyone who pre-registers an email see the victim's orders.
    if (!endCustomerId) {
      const existing = await prisma.endCustomer.findUnique({
        where: { storefrontId_email: { storefrontId: config.id, email } },
      })
      if (existing && !existing.isGuest) {
        return errorResponse(
          'An account exists for this email. Please sign in to complete checkout.',
          409,
          'ACCOUNT_EXISTS'
        )
      }
      if (existing) {
        endCustomerId = existing.id
      } else {
        const guest = await prisma.endCustomer.create({
          data: {
            storefrontId: config.id,
            email,
            firstName: shippingAddress.firstName,
            lastName: shippingAddress.lastName,
            isGuest: true,
            shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
          },
        })
        endCustomerId = guest.id
      }
    }

    // Resolve retail prices for validation
    const sfProducts = await prisma.storefrontProduct.findMany({
      where: {
        id: { in: items.map((i) => i.storefrontProductId) },
        storefrontId: config.id,
        isEnabled: true,
      },
      include: { retailPrice: true, variant: { select: { status: true } } },
    })

    const productMap = new Map(sfProducts.map((p) => [p.id, p]))
    const orderItems = items.map((item) => {
      const sp = productMap.get(item.storefrontProductId)
      if (!sp) throw new Error(`Product ${item.storefrontProductId} not available`)
      // A stale storefront listing must not sell an archived catalog variant.
      if (sp.variant.status !== 'ACTIVE') {
        throw new Error(`Product ${item.storefrontProductId} not available`)
      }
      if (!sp.retailPrice || !sp.retailPrice.isActive) {
        throw new Error(`Product ${item.storefrontProductId} has no active price`)
      }
      return {
        storefrontProductId: item.storefrontProductId,
        quantity: item.quantity,
        unitRetailPrice: Number(sp.retailPrice.retailPrice),
      }
    })

    const result = await createRetailOrder({
      storefrontId: config.id,
      endCustomerId,
      guestEmail: endCustomerId ? undefined : email,
      shippingAddress: shippingAddress as unknown as Record<string, unknown>,
      billingAddress: (billingAddress ?? shippingAddress) as unknown as Record<string, unknown>,
      notes,
      items: orderItems,
    })

    return successResponse(
      {
        orderId: result.retailOrder.id,
        orderNumber: result.retailOrder.orderNumber,
        total: Number(result.retailOrder.total),
        status: result.retailOrder.status,
      },
      201
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Checkout failed'
    logger.error('Checkout error', { message: msg }, error as Error)
    return errorResponse(msg, msg.includes('not available') || msg.includes('no active') ? 400 : 500)
  }
}
