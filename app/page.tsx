import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'

// Check if Clerk is configured
const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

export default async function RootPage() {
  // If Clerk is not configured, go to dashboard (dev mode)
  if (!isClerkConfigured) {
    redirect('/dashboard')
  }

  // Check auth - middleware handles the redirect logic
  const { userId, sessionClaims } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  // Get role and redirect accordingly
  const role = (sessionClaims?.metadata as { role?: string })?.role || 'CLIENT'
  const redirectUrl = role === 'ADMIN' || role === 'SUPER_ADMIN' ? '/dashboard' : '/shop'

  redirect(redirectUrl)
}
