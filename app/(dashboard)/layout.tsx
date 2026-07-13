import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { AdminHeader } from '@/components/AdminHeader'
import { AdminFooter } from '@/components/AdminFooter'

// Force dynamic rendering - dashboard requires auth context
export const dynamic = 'force-dynamic'

/**
 * Admin 2FA enforcement: when ADMIN_REQUIRE_2FA=true, admins without a second
 * factor enrolled in Clerk are bounced to /enable-2fa before they can use the
 * admin console. Checked in the layout (server-side, once per navigation).
 * Fails open on Clerk errors so a Clerk outage can't lock out the console.
 */
async function assertAdmin2fa() {
  if (process.env.ADMIN_REQUIRE_2FA !== 'true') return
  try {
    const user = await currentUser()
    if (!user) return
    const meta = user.publicMetadata as { role?: string } | undefined
    const isAdmin = meta?.role === 'ADMIN' || meta?.role === 'SUPER_ADMIN'
    if (isAdmin && !user.twoFactorEnabled) {
      redirect('/enable-2fa')
    }
  } catch (e) {
    // next/navigation redirect() throws internally — re-throw those.
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await assertAdmin2fa()
  return (
    <div className="dark flex min-h-screen w-full flex-col overflow-x-hidden bg-brand-onyx">
      <AdminHeader />
      <main className="w-full min-w-0 flex-1 bg-linear-to-br from-brand-onyx via-brand-onyx to-[#0a0e3a]">
        <div className="p-4 md:p-6">{children}</div>
      </main>
      <AdminFooter />
    </div>
  )
}
