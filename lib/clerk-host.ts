/**
 * Clerk production publishable keys are domain-locked to peptsci.com.
 * Loading <ClerkProvider> on localhost (or any other host) with pk_live
 * throws: "Production Keys are only allowed for domain peptsci.com".
 *
 * Public pages like /catalog still need to render locally; pass the key
 * through only when the request host is allowed to use it.
 */
export function clerkPublishableKeyForHost(
  publishableKey: string | undefined,
  host: string | null | undefined
): string | undefined {
  if (!publishableKey?.startsWith('pk_')) return undefined
  if (publishableKey.startsWith('pk_test_')) return publishableKey

  const hostname = (host ?? '')
    .split(',')[0]
    .trim()
    .split(':')[0]
    .toLowerCase()

  if (hostname === 'peptsci.com' || hostname.endsWith('.peptsci.com')) {
    return publishableKey
  }
  return undefined
}
