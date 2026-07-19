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
  // Landing page (app/page.tsx redirects signed-in users by role)
  '/',
  // Public legal pages
  '/termsandconditions(.*)',
  '/privacy(.*)',
  '/refunds(.*)',
  '/shipping(.*)',
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
  // Affiliate program: public application form + referral-link redirect.
  '/partners/apply(.*)',
  '/api/partners/apply',
  '/join(.*)',
  // Clinic-to-clinic referral links (store-credit program).
  '/refer(.*)',
  // Partner read-only API authenticates via hashed API keys inside the route.
  '/api/partner/v1(.*)',
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
  // Affiliate partner administration (orgs, ledger, payouts).
  '/partners-admin(.*)',
  '/api/admin(.*)',
])

// Client-only routes (shop)
const isClientRoute = createRouteMatcher(['/shop(.*)'])

// Partner-portal routes (affiliate sales orgs / reps). The public apply page
// is excluded via isPublicRoute, which is checked first. NOTE: '/partners(.*)'
// would also match '/partners-admin' (the ADMIN section) and bounce admins to
// /dashboard — match '/partners' exactly plus '/partners/…' segments only.
const isPartnerRoute = createRouteMatcher([
  '/partners',
  '/partners/(.*)',
  '/api/partners',
  '/api/partners/(.*)',
])

// Routes that need pending approval check
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/shop(.*)',
  '/partners',
  '/partners/(.*)',
])

/** Landing route by role (PARTNER → portal, admins → dashboard, else shop). */
function homeForRole(role: string): string {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return '/dashboard'
  if (role === 'PARTNER') return '/partners'
  return '/shop'
}

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
          return NextResponse.redirect(new URL(homeForRole(role), request.url))
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

      // Suspended accounts are denied everywhere. API routes get a 403 JSON
      // (so clients don't follow a redirect to an HTML page); page routes are
      // sent to the pending-approval screen which explains the account state.
      if (status === 'SUSPENDED') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'Forbidden', message: 'Account suspended', code: 'ACCOUNT_SUSPENDED' },
            { status: 403 }
          )
        }
        if (!pathname.startsWith('/pending-approval')) {
          return NextResponse.redirect(new URL('/pending-approval', request.url))
        }
        return NextResponse.next()
      }

      // Check if user is pending approval. API calls get 403 JSON (mirroring
      // the suspended path) — a 307 to the pending-approval HTML page breaks
      // fetch() callers that try to parse the response as JSON.
      if (status === 'PENDING') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'Forbidden', message: 'Account pending approval', code: 'ACCOUNT_PENDING' },
            { status: 403 }
          )
        }
        if (!pathname.startsWith('/pending-approval')) {
          return NextResponse.redirect(new URL('/pending-approval', request.url))
        }
      }

      // Approved accounts have no business on the pending screen — move them
      // on (this is what makes the page's "Check Status" reload work once an
      // admin approves; session claims refresh within ~60s of the approval).
      if (status === 'ACTIVE' && pathname.startsWith('/pending-approval')) {
        return NextResponse.redirect(new URL(homeForRole(role), request.url))
      }

      // Role-based access control
      if (isAdminRoute(request)) {
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
          // Non-admin trying to access admin routes - send them home
          return NextResponse.redirect(new URL(homeForRole(role), request.url))
        }
      }

      // Partner portal: PARTNER accounts only (admins manage partners from
      // /dashboard; clinics have no business here). API calls get 403 JSON.
      if (isPartnerRoute(request) && role !== 'PARTNER') {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'Forbidden', message: 'Partner access required', code: 'PARTNER_REQUIRED' },
            { status: 403 }
          )
        }
        return NextResponse.redirect(new URL(homeForRole(role), request.url))
      }

      // Shop is for clinic + admin accounts; partners are portal-only.
      if (isClientRoute(request) && role === 'PARTNER') {
        return NextResponse.redirect(new URL('/partners', request.url))
      }

      // Handle root path - redirect based on role
      if (request.nextUrl.pathname === '/') {
        return NextResponse.redirect(new URL(homeForRole(role), request.url))
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
