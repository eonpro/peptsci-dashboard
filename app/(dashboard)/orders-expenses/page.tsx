import { getDistributorOrders } from '@/lib/orders'
import OrdersExpensesClient from './OrdersExpensesClient'

// Distributor orders are per-request data (Sheets-backed); render dynamically
// and seed the client island server-side so there's no first-paint skeleton.
export const dynamic = 'force-dynamic'

export default async function OrdersExpensesPage() {
  const initialOrders = await getDistributorOrders()
  return <OrdersExpensesClient initialOrders={initialOrders} />
}
