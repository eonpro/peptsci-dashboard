import { Card, CardContent } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth'
import { resolveShopClientId } from '@/lib/shop-actor'
import { listShopCustomers, type ShopCustomerListItem } from '@/lib/shop-customers'
import { logger } from '@/lib/logger'
import { CustomersClient } from './CustomersClient'

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  let customers: ShopCustomerListItem[] | null = null
  let error: string | null = null

  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) {
      error = 'You must be signed in to view customers'
    } else {
      const clientId = await resolveShopClientId(userId)
      if (!clientId) {
        error = 'No client account linked'
      } else {
        customers = await listShopCustomers(clientId)
      }
    }
  } catch (err) {
    logger.error(
      '[shop/customers] page load error',
      {},
      err instanceof Error ? err : new Error(String(err))
    )
    error = 'Failed to load customers'
  }

  if (error || !customers) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Customers</h1>
          <p className="mt-1 text-white/60">Ship-to recipients and their orders</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-red-400">{error ?? 'Failed to load'}</CardContent>
        </Card>
      </div>
    )
  }

  return <CustomersClient customers={customers} />
}
