import { getSales } from '@/lib/sheets'
import DashboardClient from './DashboardClient'

// Fetch sales on the server so the first paint already includes KPIs/charts
// (no loading skeleton, no extra client round trip to /api/sales). The parsed
// Sheets data is cached in lib/sheets.ts, so this read is cheap on repeat hits.
export default async function DashboardPage() {
  const sales = await getSales()
  return <DashboardClient initialSales={sales} />
}
