import { Card, CardContent } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth'
import { resolveShopClientId } from '@/lib/shop-actor'
import { listClientOrders, type ShopOrder } from '@/lib/shop-orders'
import { logger } from '@/lib/logger'
import { OrdersClient } from './OrdersClient'

// Orders are per-client and change frequently — always render fresh.
export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  let orders: ShopOrder[] | null = null
  let error: string | null = null

  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) {
      error = 'You must be signed in to view orders'
    } else {
      const clientId = await resolveShopClientId(userId)
      if (!clientId) {
        error = 'No client account linked'
      } else {
        orders = await listClientOrders(clientId)
      }
    }
  } catch (err) {
    logger.error('[shop/orders] page load error', {}, err instanceof Error ? err : new Error(String(err)))
    error = 'Failed to load orders'
  }

  if (error || !orders) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">My Orders</h1>
          <p className="text-white/60 mt-1">Track and manage your orders</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-red-400">
            {error ?? 'Failed to load orders'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return <OrdersClient orders={orders} />
}
