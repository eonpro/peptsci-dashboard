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
/** Stable fingerprint of a cart's lines (variant + qty + unit price). */
function cartLineFingerprint(lines: ResolvedCart['lines']): string {
  return lines
    .map((l) => `${l.variantId}:${l.quantity}:${l.unitPrice}`)
    .sort()
    .join('|')
}

/** How long a DRAFT/PENDING order stays reusable for de-duping resubmits. */
const REUSABLE_DRAFT_WINDOW_MS = 30 * 60 * 1000

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

  // Idempotency for double-submits/retries: if this client already has a recent
  // DRAFT order still awaiting payment that matches this exact cart + shipping
  // options, reuse it instead of creating a parallel payable order. Because the
  // Stripe idempotency key is derived from the order id (`pi_create_${id}`),
  // reusing the order also makes Stripe return the same PaymentIntent.
  const shipTo = params.shipTo ?? 'PRACTICE'
  const shipSpeed = params.shipSpeed ?? 'TWO_DAY'
  const patientId = params.patientId ?? null
  const fingerprint = cartLineFingerprint(cart.lines)

  const candidates = await prisma.order.findMany({
    where: {
      clientId: params.clientId,
      status: 'DRAFT',
      paymentStatus: 'PENDING',
      shipTo,
      shipSpeed,
      patientId,
      total: cart.totals.total,
      createdAt: { gte: new Date(Date.now() - REUSABLE_DRAFT_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    include: { items: { select: { variantId: true, quantity: true, unitPrice: true } } },
    take: 5,
  })
  const reusable = candidates.find(
    (o) =>
      cartLineFingerprint(
        o.items.map((it) => ({
          variantId: it.variantId,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice),
        })) as ResolvedCart['lines']
      ) === fingerprint
  )
  if (reusable) {
    logger.info('[CHECKOUT] Reusing existing draft order for resubmit', {
      orderId: reusable.id,
      clientId: params.clientId,
    })
    return reusable
  }

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
      shipTo,
      shipSpeed,
      patientId,
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
