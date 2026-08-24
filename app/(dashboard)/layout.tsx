import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { AdminHeader } from '@/components/AdminHeader'
import { AdminFooter } from '@/components/AdminFooter'
import { ThemeScope } from '@/components/ThemeScope'
import { StaffSectionNav } from '@/components/staff/StaffSectionNav'
import { StaffMobileNav } from '@/components/staff/StaffMobileNav'
import { isStaffRole } from '@/lib/access'
import { resolvePermissions } from '@/lib/permissions'
import { staffNeedsTwoFactor } from '@/lib/staff/access'

export const dynamic = 'force-dynamic'

/**
 * When ADMIN_REQUIRE_2FA=true, any staff preset that can write money or PII
 * must have a second factor. Finance viewers are not forced through this gate.
 * Clerk outages fail closed in production so writers cannot skip 2FA.
 */
async function assertStaff2fa() {
  if (process.env.ADMIN_REQUIRE_2FA !== 'true') return
  try {
    const user = await currentUser()
    if (!user) return
    const meta = user.publicMetadata as {
      role?: string
      permissionsGrant?: unknown
      permissionsDeny?: unknown
    } | undefined
    if (!isStaffRole(meta?.role)) return
    const permissions = resolvePermissions({
      role: meta?.role,
      permissionsGrant: meta?.permissionsGrant,
      permissionsDeny: meta?.permissionsDeny,
    })
    if (staffNeedsTwoFactor(permissions) && !user.twoFactorEnabled) {
      redirect('/enable-2fa')
    }
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    if (process.env.NODE_ENV === 'production') {
      redirect('/enable-2fa')
    }
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await assertStaff2fa()
  return (
    <div className="dark flex min-h-screen w-full flex-col overflow-x-hidden bg-brand-onyx">
      <ThemeScope theme="dark" />
      <AdminHeader />
      <main className="w-full min-w-0 flex-1 bg-linear-to-br from-brand-onyx via-brand-onyx to-[#0a0e3a] pb-20 lg:pb-0">
        <div className="p-4 md:p-6">
          <StaffSectionNav />
          {children}
        </div>
      </main>
      <AdminFooter />
      <StaffMobileNav />
    </div>
  )
}
