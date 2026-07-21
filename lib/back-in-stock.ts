/**
 * Back-in-stock alerts.
 *
 * A clinic taps "Notify me" on an out-of-stock product (PDP). When a receive/
 * restock makes the variant sellable again (available = onHand − reserved > 0),
 * every armed subscription fires ONCE — bell notification for each of the
 * clinic's ACTIVE users plus an email to the practice contact — and is stamped
 * `notifiedAt`. Re-subscribing after a fire re-arms the same row.
 *
 * Firing is fire-and-forget from the stock-increase paths (receive batch,
 * positive manual adjustment, return restock, label-void reverse): alert
 * failures must never fail an inventory mutation. Idempotency is a conditional
 * claim on `notifiedAt IS NULL`, so concurrent restocks can't double-send.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { notifyUser } from '@/lib/notifications/service'
import { sendBackInStockEmail } from '@/lib/email'

function db() {
  if (!prisma) throw new Error('Database is not configured')
  return prisma
}

/** Subscribe (or re-arm) a clinic's alert for a variant. */
export async function subscribeBackInStock(
  clientId: string,
  variantId: string,
  createdBy?: string | null
) {
  return db().backInStockSubscription.upsert({
    where: { clientId_variantId: { clientId, variantId } },
    update: { notifiedAt: null, createdBy: createdBy ?? null },
    create: { clientId, variantId, createdBy: createdBy ?? null },
  })
}

/** Remove a clinic's alert for a variant (no-op when none exists). */
export async function unsubscribeBackInStock(clientId: string, variantId: string) {
  await db().backInStockSubscription.deleteMany({ where: { clientId, variantId } })
}

/** Variant ids the clinic currently has ARMED alerts for (for UI state). */
export async function armedVariantIds(clientId: string): Promise<Set<string>> {
  const rows = await db().backInStockSubscription.findMany({
    where: { clientId, notifiedAt: null },
    select: { variantId: true },
  })
  return new Set(rows.map((r) => r.variantId))
}

/**
 * Fire alerts for a variant if it is sellable again. Called after any stock
 * increase; safe to call unconditionally (checks availability itself).
 * Never throws.
 */
export async function fireBackInStockAlerts(variantId: string): Promise<void> {
  try {
    if (!prisma) return
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        sku: true,
        dose: true,
        status: true,
        inventoryOnHand: true,
        inventoryReserved: true,
        product: { select: { name: true, status: true } },
      },
    })
    if (!variant || variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE') return
    const available = variant.inventoryOnHand - variant.inventoryReserved
    if (available <= 0) return

    const subs = await prisma.backInStockSubscription.findMany({
      where: { variantId, notifiedAt: null },
      select: {
        id: true,
        clientId: true,
        client: {
          select: {
            contactEmail: true,
            contactName: true,
            organizationName: true,
            users: { where: { status: 'ACTIVE' }, select: { id: true } },
          },
        },
      },
    })
    if (subs.length === 0) return

    const sku = variant.sku ?? variant.id
    const label = variant.dose ? `${variant.product.name} ${variant.dose}` : variant.product.name

    for (const sub of subs) {
      // Conditional claim: only the first concurrent firer gets count === 1.
      const claim = await prisma.backInStockSubscription.updateMany({
        where: { id: sub.id, notifiedAt: null },
        data: { notifiedAt: new Date() },
      })
      if (claim.count === 0) continue

      for (const u of sub.client.users) {
        await notifyUser(u.id, {
          clientId: sub.clientId,
          category: 'INVENTORY',
          priority: 'NORMAL',
          title: `Back in stock: ${label}`,
          message: `${label} is available again — order while it's in stock.`,
          actionUrl: `/shop/product/${encodeURIComponent(sku)}`,
          sourceType: 'back-in-stock',
          sourceId: sub.id,
          metadata: { variantId, sku },
        }).catch(() => {})
      }

      if (sub.client.contactEmail) {
        await sendBackInStockEmail({
          to: sub.client.contactEmail,
          contactName: sub.client.contactName || sub.client.organizationName,
          productName: variant.product.name,
          dose: variant.dose,
          sku,
        }).catch(() => {})
      }
    }

    logger.info('[BACK IN STOCK] alerts fired', { variantId, sku, count: subs.length })
  } catch (error) {
    logger.warn('[BACK IN STOCK] alert pass failed (non-blocking)', {
      variantId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
