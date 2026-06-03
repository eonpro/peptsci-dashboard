import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { getUserMetadata } from '@/lib/roles'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

async function resolveStorefrontId(clientId: string): Promise<string | null> {
  if (!prisma) return null
  const sf = await prisma.storefront.findUnique({ where: { clientId }, select: { id: true } })
  return sf?.id ?? null
}

export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const meta = await getUserMetadata()
    if (!meta.clientId) return errorResponse('No client association', 403, 'NO_CLIENT')

    const storefrontId = await resolveStorefrontId(meta.clientId)
    if (!storefrontId) return errorResponse('No storefront', 404, 'NOT_FOUND')

    if (!prisma) return successResponse([])

    const prices = await prisma.storefrontRetailPrice.findMany({
      where: {
        storefrontProduct: { storefrontId },
        isActive: true,
      },
      include: {
        storefrontProduct: {
          include: {
            variant: {
              include: { product: { select: { name: true, category: true } } },
            },
          },
        },
      },
      orderBy: { storefrontProduct: { displayOrder: 'asc' } },
    })

    const result = prices.map((p) => ({
      id: p.id,
      storefrontProductId: p.storefrontProductId,
      variantId: p.storefrontProduct.variantId,
      productName: p.storefrontProduct.variant.product.name,
      sku: p.storefrontProduct.variant.sku,
      dose: p.storefrontProduct.variant.dose,
      category: p.storefrontProduct.variant.product.category,
      retailPrice: Number(p.retailPrice),
      compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
      isActive: p.isActive,
    }))

    return successResponse(result)
  } catch (error) {
    logger.error('Error fetching storefront pricing', {}, error as Error)
    return errorResponse('Failed to fetch pricing')
  }
}

const bulkPricingSchema = z.object({
  prices: z.array(
    z.object({
      storefrontProductId: z.string().min(1),
      retailPrice: z.number().positive(),
      compareAtPrice: z.number().positive().nullable().optional(),
    })
  ),
})

export async function PUT(request: NextRequest) {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const meta = await getUserMetadata()
    if (!meta.clientId) return errorResponse('No client association', 403, 'NO_CLIENT')

    const storefrontId = await resolveStorefrontId(meta.clientId)
    if (!storefrontId) return errorResponse('No storefront', 404, 'NOT_FOUND')
    if (!prisma) return errorResponse('Database not connected')

    const body = await request.json()
    const parsed = bulkPricingSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }

    // Verify all products belong to this storefront
    const productIds = parsed.data.prices.map((p) => p.storefrontProductId)
    const validProducts = await prisma.storefrontProduct.findMany({
      where: { id: { in: productIds }, storefrontId },
      select: { id: true },
    })
    const validIds = new Set(validProducts.map((p) => p.id))
    const invalid = productIds.filter((id) => !validIds.has(id))
    if (invalid.length > 0) {
      return errorResponse(`Products not found in storefront: ${invalid.join(', ')}`, 400, 'INVALID_PRODUCTS')
    }

    await prisma.$transaction(
      parsed.data.prices.map((p) =>
        prisma!.storefrontRetailPrice.upsert({
          where: { storefrontProductId: p.storefrontProductId },
          update: {
            retailPrice: p.retailPrice,
            compareAtPrice: p.compareAtPrice ?? null,
            isActive: true,
          },
          create: {
            storefrontProductId: p.storefrontProductId,
            retailPrice: p.retailPrice,
            compareAtPrice: p.compareAtPrice ?? null,
            isActive: true,
          },
        })
      )
    )

    return successResponse({ message: `${parsed.data.prices.length} prices updated` })
  } catch (error) {
    logger.error('Error updating storefront pricing', {}, error as Error)
    return errorResponse('Failed to update pricing')
  }
}
