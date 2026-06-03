import { getSales, getInventory } from '@/lib/sheets'
import { getDistributorOrders } from '@/lib/orders'
import ProfitLossClient from './ProfitLossClient'

// Fetch the financial inputs on the server so the page renders with data on the
// first paint instead of showing a skeleton and firing three client requests to
// /api/sales, /api/inventory and /api/orders. The Sheets reads are cached in
// lib/sheets.ts, so repeat navigations are cheap.
export default async function ProfitLossPage() {
  const [sales, inventory, orders] = await Promise.all([
    getSales(),
    getInventory(),
    getDistributorOrders(),
  ])

  return (
    <ProfitLossClient initialSales={sales} initialInventory={inventory} initialOrders={orders} />
  )
}
