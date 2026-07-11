/**
 * Order-confirmation email sender. Loads the order's lines + practice contact
 * and delegates to the branded template. Fire-and-forget safe: never throws,
 * no-ops when the client has no contact email or EMAIL_ENABLED is off.
 *
 * Called on the FIRST payment capture (lib/stripe/payments.ts) and on
 * bill-to-account (net terms) order submission.
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendOrderConfirmationEmail } from '@/lib/email'

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export async function sendOrderConfirmationForOrder(
  orderId: string,
  opts: { paymentLabel: string }
): Promise<void> {
  try {
    if (!prisma) return
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        subtotal: true,
        shippingTotal: true,
        total: true,
        client: {
          select: { contactEmail: true, contactName: true, organizationName: true },
        },
        items: {
          select: {
            quantity: true,
            totalPrice: true,
            variant: { select: { dose: true, product: { select: { name: true } } } },
          },
        },
      },
    })
    if (!order?.client?.contactEmail) return

    await sendOrderConfirmationEmail({
      to: order.client.contactEmail,
      customerName: order.client.contactName || order.client.organizationName,
      orderNumber: order.orderNumber,
      items: order.items.map((it) => ({
        name: it.variant.product.name,
        dose: it.variant.dose,
        quantity: it.quantity,
        lineTotal: usd(Number(it.totalPrice)),
      })),
      subtotal: usd(Number(order.subtotal)),
      shipping: Number(order.shippingTotal) === 0 ? 'FREE' : usd(Number(order.shippingTotal)),
      total: usd(Number(order.total)),
      paymentLabel: opts.paymentLabel,
    })
  } catch (err) {
    logger.warn('[ORDERS] confirmation email failed (non-blocking)', {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
