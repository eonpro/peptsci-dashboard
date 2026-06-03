import { NextRequest } from 'next/server'
import { errorResponse, successResponse } from '@/lib/auth'
import { verifyEndCustomerToken } from '@/lib/end-customer-auth'
import { getRetailOrders } from '@/lib/storefront'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return errorResponse('Authentication required', 401, 'AUTH_REQUIRED')

    const payload = verifyEndCustomerToken(token)
    if (!payload) return errorResponse('Invalid or expired token', 401, 'INVALID_TOKEN')

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)
    const offset = parseInt(searchParams.get('offset') ?? '0', 10)

    const orders = await getRetailOrders(payload.storefrontId, {
      endCustomerId: payload.endCustomerId,
      limit,
      offset,
    })

    const result = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      subtotal: Number(o.subtotal),
      taxTotal: Number(o.taxTotal),
      shippingTotal: Number(o.shippingTotal),
      total: Number(o.total),
      itemCount: o.items.length,
      items: o.items.map((item) => ({
        productName: item.storefrontProduct.variant.product.name,
        sku: item.storefrontProduct.variant.sku,
        quantity: item.quantity,
        unitPrice: Number(item.unitRetailPrice),
        total: Number(item.totalPrice),
      })),
      createdAt: o.createdAt.toISOString(),
    }))

    return successResponse(result)
  } catch (error) {
    logger.error('Error fetching end customer orders', {}, error as Error)
    return errorResponse('Failed to fetch orders')
  }
}
