import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { isClerkConfigured } from '@/lib/clerk-config'
import { partnerPostAuthPath } from '@/lib/partners/access'

export const dynamic = 'force-dynamic'

/**
 * Dedicated partner sign-in URL. Unsigned visitors go to the shared Clerk
 * screen with intent=partner. Signed-in visitors go to /partners so clinic
 * and staff accounts see the wrong-account screen instead of the shop.
 */
export default async function PartnerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const q = await searchParams
  if (isClerkConfigured) {
    const { userId } = await auth()
    if (userId) {
      redirect(partnerPostAuthPath({ intent: 'partner', redirectUrl: q.redirect_url }))
    }
  }
  const params = new URLSearchParams({ intent: 'partner' })
  if (q.redirect_url) params.set('redirect_url', q.redirect_url)
  redirect(`/sign-in?${params.toString()}`)
}
