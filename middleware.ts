import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware({
  publicRoutes: [
    '/', // landing page if needed
    '/api/webhooks/stripe',
    '/api/webhooks/clerk',
  ],
})

export const config = {
  matcher: [
    '/((?!_next|.*\\..*).*)',
  ],
}
