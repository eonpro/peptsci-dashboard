import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Check if Clerk is configured
const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

// Define routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/', // landing page if needed
  '/api/webhooks/stripe',
  '/api/webhooks/clerk',
  '/sign-in(.*)',
  '/sign-up(.*)',
])

// Conditional middleware - skip Clerk if not configured
const middleware = isClerkConfigured
  ? clerkMiddleware(async (auth, request) => {
      // Protect all routes except public ones
      if (!isPublicRoute(request)) {
        await auth.protect()
      }
    })
  : (request: NextRequest) => NextResponse.next()

export default middleware

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
