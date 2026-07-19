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
  describeStockShortages,
  findStockShortages,
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
  /**
   * When true, reject carts whose quantities exceed sellable stock
   * (onHand − reserved). Clinic checkout hard-blocks oversell; admin manual
   * orders leave this off (operators may intentionally oversell).
   */
  enforceStock?: boolean
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
              AND: [
                { OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] },
                { OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }] },
              ],
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
    // Unpriced variants (SRP 0 and no custom client price) must not reach
    // payment: Stripe rejects sub-minimum amounts with an opaque 500.
    if (unitPrice <= 0) {
      throw new CartValidationError(
        `"${variant.product.name}" is not currently priced for ordering — please remove it from your cart and contact support`,
        'CART_PRICE_UNSET'
      )
    }
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

  // Oversell gate: block checkout when a line exceeds sellable stock. Checked
  // pre-payment so a card is never charged for goods we cannot ship. (The
  // reservation at capture remains non-blocking as a last resort.)
  if (params.enforceStock) {
    const shortages = findStockShortages(
      items.map((item) => {
        const v = bySku.get(item.sku)!
        return {
          sku: item.sku,
          productName: v.product.name,
          quantity: item.quantity,
          available: v.inventoryOnHand - v.inventoryReserved,
        }
      })
    )
    if (shortages.length > 0) {
      throw new CartValidationError(
        `Insufficient stock — ${describeStockShortages(shortages)}`,
        'INSUFFICIENT_STOCK'
      )
    }
  }

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

/** Stripe rejects charges under $0.50 — credit either covers ALL of the total
 * or must leave at least this much on the card. */
const STRIPE_MIN_CHARGE_CENTS = 50

export async function createDraftOrder(params: {
  clientId: string
  createdById: string
  cart: ResolvedCart
  shippingAddress?: Prisma.InputJsonValue
  notes?: string
  shipTo?: ShipTo
  shipSpeed?: ShipSpeed
  patientId?: string | null
  /**
   * Referral store credit the buyer asked to apply (integer cents). Clamped
   * server-side inside the per-client lock to the REAL available balance
   * (ledger sum minus credit already held by other open drafts), so parallel
   * checkouts can never double-spend the same credit.
   */
  requestedCreditCents?: number
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
  const requestedCreditCents = Math.max(0, Math.floor(params.requestedCreditCents ?? 0))
  const fingerprint = cartLineFingerprint(cart.lines)

  // The find-or-create below runs inside a transaction holding a per-client
  // Postgres advisory lock, so two concurrent submissions of the same cart
  // (double-click, two tabs) are serialized: the second waits, then finds and
  // reuses the first one's draft instead of creating a parallel payable order
  // (which would have produced a second PaymentIntent → double charge).
  const { order, reused } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('draft-order'), hashtext(${params.clientId}))`

    // Reuse only drafts with matching credit semantics (both with or both
    // without credit): the credit amount is frozen on the draft, so a shopper
    // who toggled the credit box between submits must get a fresh draft.
    const candidates = await tx.order.findMany({
      where: {
        clientId: params.clientId,
        status: 'DRAFT',
        paymentStatus: 'PENDING',
        shipTo,
        shipSpeed,
        patientId,
        creditApplied: requestedCreditCents > 0 ? { gt: 0 } : { equals: 0 },
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
      // Same cart, but the shopper may have edited the shipping address or
      // notes since the draft was created — refresh them so fulfillment ships
      // to what the buyer last confirmed, not the first attempt's snapshot.
      const refreshed = await tx.order.update({
        where: { id: reusable.id },
        data: {
          shippingAddress: params.shippingAddress ?? Prisma.JsonNull,
          notes: params.notes ?? null,
        },
      })
      return { order: refreshed, reused: true }
    }

    // ── Referral-credit clamp (inside the lock, race-safe) ──
    const totalCents = Math.round(cart.totals.total * 100)
    let appliedCreditCents = 0
    if (requestedCreditCents > 0) {
      const [ledger, holds] = await Promise.all([
        tx.clientCreditEntry.aggregate({
          where: { clientId: params.clientId },
          _sum: { amountCents: true },
        }),
        // Credit already committed to other open (payable) drafts in the
        // reuse window — those may still capture, so their credit is held.
        tx.order.aggregate({
          where: {
            clientId: params.clientId,
            status: 'DRAFT',
            paymentStatus: 'PENDING',
            creditApplied: { gt: 0 },
            createdAt: { gte: new Date(Date.now() - REUSABLE_DRAFT_WINDOW_MS) },
          },
          _sum: { creditApplied: true },
        }),
      ])
      const balance = ledger._sum.amountCents ?? 0
      const held = Math.round(Number(holds._sum.creditApplied ?? 0) * 100)
      const available = Math.max(0, balance - held)
      appliedCreditCents = Math.min(requestedCreditCents, available, totalCents)
      // Stripe can't charge less than $0.50: leave the minimum on the card
      // unless credit covers the ENTIRE total.
      const remainder = totalCents - appliedCreditCents
      if (remainder > 0 && remainder < STRIPE_MIN_CHARGE_CENTS) {
        appliedCreditCents = Math.max(0, totalCents - STRIPE_MIN_CHARGE_CENTS)
      }
    }
    const effectiveTotal = round2((totalCents - appliedCreditCents) / 100)

    const created = await tx.order.create({
      data: {
        clientId: params.clientId,
        source: 'DIRECT',
        status: 'DRAFT',
        paymentStatus: 'PENDING',
        subtotal: cart.totals.subtotal,
        taxTotal: cart.totals.taxTotal,
        shippingTotal: cart.totals.shippingTotal,
        total: effectiveTotal,
        creditApplied: round2(appliedCreditCents / 100),
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
    return { order: created, reused: false }
  })

  if (reused) {
    logger.info('[CHECKOUT] Reusing existing draft order for resubmit', {
      orderId: order.id,
      clientId: params.clientId,
    })
  } else {
    logger.info('[CHECKOUT] Draft order created', {
      orderId: order.id,
      clientId: params.clientId,
      total: cart.totals.total,
      lineCount: cart.lines.length,
    })
  }

  return order
}
