import { STAFF_MONEY_LINKS } from '@/lib/staff/portal'
import { StaffHubGrid } from '@/components/staff/StaffHubGrid'

export default function StaffMoneyHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Money</h1>
        <p className="mt-1 text-sm text-white/60">Customers, invoices, P&L, and reports.</p>
      </div>
      <StaffHubGrid links={STAFF_MONEY_LINKS} />
    </div>
  )
}
