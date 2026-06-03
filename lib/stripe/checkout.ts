/**
 * Server-side cart resolution and DRAFT order persistence for Stripe checkout.
 *
 * SECURITY: unit prices are resolved here from Postgres (variant SRP +
 * per-client ClientPricing) — the client-sent cart price is NEVER trusted.
 * This is the heart of Model A: Stripe only ever receives the server-computed
 * amount, and our catalog/pricing stay private.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolveEffectiveUnitPrice } from '@/lib/access'
import {
  CartValidationError,
  computeCartTotals,
  round2,
  validateCartInput,
  type CartLineInput,
  type CartTotals,
  type ResolvedLine,
  type ShipSpeed,
  type ShipTo,
} from '@/lib/checkout-core'

export interface ResolvedCart {
  lines: ResolvedLine[]
  totals: CartTotals
}

/**
 * Resolve a cart against the DB for the given client, computing effective
 * per-client unit prices and authoritative totals.
 *
 * @throws CartValidationError when input is invalid or a SKU is unavailable.
 */
export async function resolveCart(params: {
  clientId: string | null | undefined
  items: unknown
  speed?: ShipSpeed
}): Promise<ResolvedCart> {
  if (!prisma) throw new Error('Database not connected')

  const items: CartLineInput[] = validateCartInput(params.items)
  const skus = items.map((i) => i.sku)

  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: skus }, status: 'ACTIVE' },
    include: {
      product: { select: { name: true } },
      clientPricing: params.clientId
        ? {
            where: {
              clientId: params.clientId,
              isActive: true,
              OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
            },
          }
        : false,
    },
  })

  const bySku = new Map(variants.map((v) => [v.sku, v]))

  const lines: ResolvedLine[] = items.map((item) => {
    const variant = bySku.get(item.sku)
    if (!variant) {
      throw new CartValidationError(`Product "${item.sku}" is not available`, 'CART_SKU_UNKNOWN')
    }

    const custom =
      'clientPricing' in variant && Array.isArray(variant.clientPricing)
        ? variant.clientPricing[0]
        : undefined
    const { price, isCustom } = resolveEffectiveUnitPrice({
      srp: Number(variant.srp),
      customPrice: custom ? Number(custom.customPrice) : null,
    })

    const unitPrice = round2(price)
    return {
      variantId: variant.id,
      sku: variant.sku!,
      productName: variant.product.name,
      dose: variant.dose,
      quantity: item.quantity,
      unitPrice,
      lineTotal: round2(unitPrice * item.quantity),
      isCustomPrice: isCustom,
    }
  })

  return { lines, totals: computeCartTotals(lines, params.speed ?? 'TWO_DAY') }
}

/**
 * Create (or refresh) a DRAFT order for a checkout attempt. Returns the order
 * with its server-computed totals. Payment is captured separately via Stripe.
 */
export async function createDraftOrder(params: {
  clientId: string
  createdById: string
  cart: ResolvedCart
  shippingAddress?: Prisma.InputJsonValue
  notes?: string
  shipTo?: ShipTo
  shipSpeed?: ShipSpeed
  patientId?: string | null
}) {
  if (!prisma) throw new Error('Database not connected')

  const { cart } = params

  const order = await prisma.order.create({
    data: {
      clientId: params.clientId,
      source: 'DIRECT',
      status: 'DRAFT',
      paymentStatus: 'PENDING',
      subtotal: cart.totals.subtotal,
      taxTotal: cart.totals.taxTotal,
      shippingTotal: cart.totals.shippingTotal,
      total: cart.totals.total,
      currency: 'USD',
      notes: params.notes,
      shippingAddress: params.shippingAddress ?? Prisma.JsonNull,
      shipTo: params.shipTo ?? 'PRACTICE',
      shipSpeed: params.shipSpeed ?? 'TWO_DAY',
      patientId: params.patientId ?? null,
      createdById: params.createdById,
      items: {
        create: cart.lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: 0,
          totalPrice: l.lineTotal,
        })),
      },
    },
  })

  logger.info('[CHECKOUT] Draft order created', {
    orderId: order.id,
    clientId: params.clientId,
    total: cart.totals.total,
    lineCount: cart.lines.length,
  })

  return order
}
