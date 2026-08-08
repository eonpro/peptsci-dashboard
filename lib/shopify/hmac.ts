/**
 * Shopify webhook HMAC verification (X-Shopify-Hmac-Sha256).
 * Pure helpers — unit-tested without network.
 */

import { createHmac, timingSafeEqual } from 'crypto'

/** Compute base64 HMAC-SHA256 of the raw body with the webhook secret. */
export function shopifyHmacBase64(rawBody: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('base64')
}

/**
 * Verify X-Shopify-Hmac-Sha256 against the raw request body.
 * Returns false for missing/mismatched signatures (never throws).
 */
export function verifyShopifyWebhookHmac(
  rawBody: string | Buffer,
  secret: string,
  hmacHeader: string | null | undefined
): boolean {
  if (!hmacHeader || !secret) return false
  try {
    const expected = shopifyHmacBase64(rawBody, secret)
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(hmacHeader, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
