import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Check if Clerk is configured
const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

// The root domain (without protocol). Used to detect subdomains.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'peptsci.com'

// Subdomains that should NOT be treated as storefronts
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin', 'mail', 'staging'])

// Define routes that don't require authentication - MEMBERS ONLY PLATFORM
// Only auth pages and webhooks are public
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
  '/api/webhooks/stripe',
  '/api/webhooks/clerk',
  '/api/storefront(.*)',
  // Vercel Cron endpoints authenticate via CRON_SECRET inside each route
  // (lib/cron/auth.ts), not a Clerk session.
  '/api/cron(.*)',
  // Public self-service shipment tracking (no PII; see app/tracking).
  '/tracking(.*)',
])

// Admin-only routes
const isAdminRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/clients(.*)',
  '/customers(.*)',
  '/products(.*)',
  '/inventory(.*)',
  '/pricing(.*)',
  '/competitors(.*)',
  '/orders-expenses(.*)',
  '/returns(.*)',
  '/invoices(.*)',
  '/reports(.*)',
  '/profit-loss(.*)',
  '/po-generator(.*)',
  '/storefronts(.*)',
  '/users(.*)',
  '/api/admin(.*)',
])

// Client-only routes (shop)
const isClientRoute = createRouteMatcher(['/shop(.*)'])

// Routes that need pending approval check
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/shop(.*)'])

// Onboarding page + the APIs it relies on. Always reachable for a signed-in
// user (even before they have a linked practice / while PENDING).
const isOnboardingRoute = createRouteMatcher([
  '/onboarding(.*)',
  '/api/onboarding(.*)',
  '/api/npi(.*)',
])

/**
 * Extract a storefront subdomain from the Host header.
 * Returns the subdomain slug or null if this is the main domain.
 * Supports:
 *   - Production:  drclinic.peptsci.com -> "drclinic"
 *   - Dev param:   ?_storefront=drclinic -> "drclinic"
 *   - Localhost:   drclinic.localhost:3000 -> "drclinic"
 */
function getStorefrontSlug(request: NextRequest): string | null {
  // Dev query-param override
  const paramSlug = request.nextUrl.searchParams.get('_storefront')
  if (paramSlug) return paramSlug

  const host = request.headers.get('host') || ''
  const hostname = host.split(':')[0] // strip port

  // Localhost subdomain: e.g. drclinic.localhost
  if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    const sub = hostname.split('.')[0]
    if (sub && !RESERVED_SUBDOMAINS.has(sub)) return sub
    return null
  }

  // Production: check against ROOT_DOMAIN
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = hostname.replace(`.${ROOT_DOMAIN}`, '')
    if (sub && !sub.includes('.') && !RESERVED_SUBDOMAINS.has(sub)) return sub
  }

  return null
}

// Conditional middleware - skip Clerk if not configured
const middleware = isClerkConfigured
  ? clerkMiddleware(async (auth, request) => {
      // ── Storefront subdomain detection ──
      const storefrontSlug = getStorefrontSlug(request)
      if (storefrontSlug) {
        const url = request.nextUrl.clone()

        // Storefront API routes: pass through with slug header
        if (url.pathname.startsWith('/api/storefront')) {
          url.searchParams.set('slug', storefrontSlug)
          const response = NextResponse.rewrite(url)
          response.headers.set('x-storefront-slug', storefrontSlug)
          return response
        }

        // Rewrite all other paths to the /sf route group
        // e.g. drclinic.peptsci.com/products/BPC-157 -> /sf/products/BPC-157
        const storefrontPath = `/sf${url.pathname === '/' ? '' : url.pathname}`
        url.pathname = storefrontPath
        const response = NextResponse.rewrite(url)
        response.headers.set('x-storefront-slug', storefrontSlug)
        return response
      }

      // ── Standard main-domain middleware (unchanged) ──
      const { userId, sessionClaims } = await auth()

      // Allow public routes without auth
      if (isPublicRoute(request)) {
        // If user is already logged in and trying to access sign-in/sign-up, redirect them
        if (
          userId &&
          (request.nextUrl.pathname.startsWith('/sign-in') ||
            request.nextUrl.pathname.startsWith('/sign-up'))
        ) {
          const role = (sessionClaims?.metadata as { role?: string })?.role || 'CLIENT'
          const redirectUrl = role === 'ADMIN' || role === 'SUPER_ADMIN' ? '/dashboard' : '/shop'
          return NextResponse.redirect(new URL(redirectUrl, request.url))
        }
        return NextResponse.next()
      }

      // All other routes require authentication
      if (!userId) {
        const signInUrl = new URL('/sign-in', request.url)
        signInUrl.searchParams.set('redirect_url', request.nextUrl.pathname)
        return NextResponse.redirect(signInUrl)
      }

      // Get user role/status/clientId from session claims (set via Clerk metadata)
      const meta = sessionClaims?.metadata as
        | { role?: string; status?: string; clientId?: string }
        | undefined
      const role = meta?.role || 'CLIENT'
      const status = meta?.status || 'PENDING'
      const clientId = meta?.clientId
      const pathname = request.nextUrl.pathname

      // Onboarding + its supporting APIs are always allowed for signed-in users.
      if (isOnboardingRoute(request)) {
        return NextResponse.next()
      }

      // New CLIENTs without a linked practice must finish onboarding first.
      if (role === 'CLIENT' && !clientId && (isProtectedRoute(request) || pathname === '/')) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }

      // Check if user is pending approval
      if (status === 'PENDING' && !pathname.startsWith('/pending-approval')) {
        return NextResponse.redirect(new URL('/pending-approval', request.url))
      }

      // Role-based access control
      if (isAdminRoute(request)) {
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
          // Non-admin trying to access admin routes - redirect to shop
          return NextResponse.redirect(new URL('/shop', request.url))
        }
      }

      if (isClientRoute(request)) {
        // Both admin and client can access shop, but we could restrict if needed
      }

      // Handle root path - redirect based on role
      if (request.nextUrl.pathname === '/') {
        const redirectUrl = role === 'ADMIN' || role === 'SUPER_ADMIN' ? '/dashboard' : '/shop'
        return NextResponse.redirect(new URL(redirectUrl, request.url))
      }

      return NextResponse.next()
    })
  : (request: NextRequest) => {
      // ── Storefront subdomain detection (dev mode) ──
      const storefrontSlug = getStorefrontSlug(request)
      if (storefrontSlug) {
        const url = request.nextUrl.clone()

        if (url.pathname.startsWith('/api/storefront')) {
          url.searchParams.set('slug', storefrontSlug)
          const response = NextResponse.rewrite(url)
          response.headers.set('x-storefront-slug', storefrontSlug)
          return response
        }

        const storefrontPath = `/sf${url.pathname === '/' ? '' : url.pathname}`
        url.pathname = storefrontPath
        const response = NextResponse.rewrite(url)
        response.headers.set('x-storefront-slug', storefrontSlug)
        return response
      }

      // Production must never run without Clerk configured. Fail closed so we
      // don't expose the entire app when the publishable key is missing.
      if (process.env.NODE_ENV === 'production') {
        return new NextResponse(
          'Authentication is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.',
          { status: 503 }
        )
      }

      // Development mode without Clerk - allow all access
      if (request.nextUrl.pathname === '/') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      return NextResponse.next()
    }

export default middleware

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
