import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { isClerkConfigured } from '@/lib/clerk-config'
import { staffPostAuthPath } from '@/lib/staff/access'

export const dynamic = 'force-dynamic'

/**
 * Dedicated staff sign-in URL. Unsigned visitors go to the shared Clerk
 * screen with intent=staff. Signed-in visitors go to /dashboard so clinic
 * and partner accounts see the wrong-account screen instead of the shop.
 */
export default async function StaffSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const q = await searchParams
  if (isClerkConfigured) {
    const { userId } = await auth()
    if (userId) {
      redirect(staffPostAuthPath({ intent: 'staff', redirectUrl: q.redirect_url }))
    }
  }
  const params = new URLSearchParams({ intent: 'staff' })
  if (q.redirect_url) params.set('redirect_url', q.redirect_url)
  redirect(`/sign-in?${params.toString()}`)
}
