import { getSales } from '@/lib/sheets'
import { groupByCustomer } from '@/lib/kpis'
import CustomersTable from './CustomersTable'

export default async function CustomersPage() {
  const sales = await getSales()
  const customers = groupByCustomer(sales)

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Customers</h2>
          <p className="text-muted-foreground">Manage and view customer information</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="rounded-lg bg-brand-primary/10 px-3 py-1">
            <span className="text-sm font-medium text-brand-primary">
              {customers.length} Total Customers
            </span>
          </div>
        </div>
      </div>

      <CustomersTable data={customers} />
    </div>
  )
}
