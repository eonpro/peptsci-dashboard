import { notFound } from 'next/navigation'
import { getSales } from '@/lib/sheets'
import { getCustomerById } from '@/lib/kpis'
import { CustomerAvatar } from '@/components/CustomerAvatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import OrderHistoryList from './OrderHistoryList'
import { CustomerPricing } from './CustomerPricing'
import { MapPin, Mail, Phone, DollarSign, ShoppingCart, Calendar, Package } from 'lucide-react'

interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const resolvedParams = await params
  const sales = await getSales()
  const customer = getCustomerById(sales, decodeURIComponent(resolvedParams.id))

  if (!customer) {
    notFound()
  }

  // Calculate MTD spend for current month (November 2025)
  const now = toZonedTime(new Date(), 'America/New_York')
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const mtdSpend = customer.orders.reduce((sum, order) => {
    if (order.Date && isWithinInterval(order.Date, { start: monthStart, end: monthEnd })) {
      return sum + order.PaidAmount
    }
    return sum
  }, 0)

  // Sort orders by date (newest first)
  const sortedOrders = customer.orders.sort((a, b) => {
    if (!a.Date || !b.Date) return 0
    return b.Date.getTime() - a.Date.getTime()
  })

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Customer Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <CustomerAvatar
            name={customer.name}
            email={customer.email}
            className="h-16 w-16 text-xl"
          />
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{customer.name}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {customer.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  <span>{customer.email}</span>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.city && customer.state && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>
                    {customer.city}, {customer.state}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lifetime Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {customer.lifetimeSpend.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTD Spend</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {mtdSpend.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customer.totalOrders}</div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {customer.avgOrderValue.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom Pricing */}
      <CustomerPricing customerId={resolvedParams.id} customerName={customer.name} />

      {/* Orders Timeline */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Order History</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderHistoryList orders={sortedOrders} />
        </CardContent>
      </Card>
    </div>
  )
}
