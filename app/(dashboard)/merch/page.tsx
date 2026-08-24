import { STAFF_CATALOG_LINKS } from '@/lib/staff/portal'
import { StaffHubGrid } from '@/components/staff/StaffHubGrid'

export default function StaffCatalogHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Catalog</h1>
        <p className="mt-1 text-sm text-white/60">Products, stock, and clinic list prices.</p>
      </div>
      <StaffHubGrid links={STAFF_CATALOG_LINKS} />
    </div>
  )
}
