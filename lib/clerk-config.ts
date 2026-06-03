/**
 * Single source of truth for whether Clerk authentication is configured.
 *
 * IMPORTANT: `NEXT_PUBLIC_*` env vars are inlined into the client bundle at
 * build time, on a per-compiled-chunk basis. If several modules each evaluate
 * `process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` independently, HMR / partial
 * recompiles can leave them with *different* inlined values. That drift made
 * `<ClerkProvider>` (in Providers) and `<SignedIn>` (in the headers) disagree,
 * producing the runtime error:
 *   "SignedIn can only be used within the <ClerkProvider /> component."
 *
 * By evaluating the flag in exactly ONE module and importing the resulting
 * boolean everywhere, all consumers share a single inlined value and can never
 * disagree.
 */
export const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export const isClerkConfigured = Boolean(clerkPublishableKey?.startsWith('pk_'))
