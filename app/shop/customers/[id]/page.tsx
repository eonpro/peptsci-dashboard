import { Card, CardContent } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth'
import { resolveShopClientId } from '@/lib/shop-actor'
import { getShopCustomer, type ShopCustomerDetail } from '@/lib/shop-customers'
import { logger } from '@/lib/logger'
import { CustomerDetailClient } from './CustomerDetailClient'

export const dynamic = 'force-dynamic'

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let customer: ShopCustomerDetail | null = null
  let error: string | null = null

  try {
    const { userId, isAuthenticated } = await requireAuth()
    if (!isAuthenticated || !userId) {
      error = 'You must be signed in'
    } else {
      const clientId = await resolveShopClientId(userId)
      if (!clientId) {
        error = 'No client account linked'
      } else {
        customer = await getShopCustomer(clientId, id)
        if (!customer) error = 'Customer not found'
      }
    }
  } catch (err) {
    logger.error(
      '[shop/customers/:id] page error',
      {},
      err instanceof Error ? err : new Error(String(err))
    )
    error = 'Failed to load customer'
  }

  if (error || !customer) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-white">Customer</h1>
        <Card>
          <CardContent className="py-12 text-center text-red-400">{error ?? 'Not found'}</CardContent>
        </Card>
      </div>
    )
  }

  return <CustomerDetailClient customer={customer} />
}
