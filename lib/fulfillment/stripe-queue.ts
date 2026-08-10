/**
 * Pure helpers for the admin Stripe → Convert fulfillment queue.
 */

/** Drop SalesRecords whose PI is already an InvoicePayment (platform AR). */
export function excludePlatformInvoiceQueueRows<
  T extends { stripePaymentIntentId: string | null },
>(records: readonly T[], platformPaymentIntentIds: ReadonlySet<string>): T[] {
  if (platformPaymentIntentIds.size === 0) return [...records]
  return records.filter(
    (r) => !(r.stripePaymentIntentId && platformPaymentIntentIds.has(r.stripePaymentIntentId))
  )
}
