import { STAFF_ADMIN_LINKS } from '@/lib/staff/portal'
import { StaffHubGrid } from '@/components/staff/StaffHubGrid'

export default function StaffAdminHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <p className="mt-1 text-sm text-white/60">Clinics, users, partners, and settings.</p>
      </div>
      <StaffHubGrid links={STAFF_ADMIN_LINKS} />
    </div>
  )
}
