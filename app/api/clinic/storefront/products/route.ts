import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { getUserMetadata } from '@/lib/roles'
import { getStorefrontProducts, upsertStorefrontProduct, removeStorefrontProduct } from '@/lib/storefront'
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

    const { searchParams } = new URL(request.url)
    const enabledOnly = searchParams.get('enabledOnly') === 'true'
    const featuredOnly = searchParams.get('featuredOnly') === 'true'

    const products = await getStorefrontProducts(storefrontId, { enabledOnly, featuredOnly })
    return successResponse(products)
  } catch (error) {
    logger.error('Error fetching storefront products', {}, error as Error)
    return errorResponse('Failed to fetch products')
  }
}

const upsertSchema = z.object({
  variantId: z.string().min(1),
  isEnabled: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  displayName: z.string().max(200).nullable().optional(),
  displayDescription: z.string().max(2000).nullable().optional(),
  retailPrice: z.number().positive().optional(),
  compareAtPrice: z.number().positive().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const meta = await getUserMetadata()
    if (!meta.clientId) return errorResponse('No client association', 403, 'NO_CLIENT')

    const storefrontId = await resolveStorefrontId(meta.clientId)
    if (!storefrontId) return errorResponse('No storefront', 404, 'NOT_FOUND')

    const body = await request.json()
    const parsed = upsertSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }

    const product = await upsertStorefrontProduct({ storefrontId, ...parsed.data })
    return successResponse(product, 201)
  } catch (error) {
    logger.error('Error upserting storefront product', {}, error as Error)
    return errorResponse('Failed to update product')
  }
}

const deleteSchema = z.object({
  variantId: z.string().min(1),
})

export async function DELETE(request: NextRequest) {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const meta = await getUserMetadata()
    if (!meta.clientId) return errorResponse('No client association', 403, 'NO_CLIENT')

    const storefrontId = await resolveStorefrontId(meta.clientId)
    if (!storefrontId) return errorResponse('No storefront', 404, 'NOT_FOUND')

    const { searchParams } = new URL(request.url)
    const parsed = deleteSchema.safeParse({ variantId: searchParams.get('variantId') })
    if (!parsed.success) {
      return errorResponse('variantId is required', 400, 'VALIDATION_ERROR')
    }

    await removeStorefrontProduct(storefrontId, parsed.data.variantId)
    return successResponse({ message: 'Product removed from storefront' })
  } catch (error) {
    logger.error('Error removing storefront product', {}, error as Error)
    return errorResponse('Failed to remove product')
  }
}
