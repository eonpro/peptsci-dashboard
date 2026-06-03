import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, errorResponse, successResponse } from '@/lib/auth'
import { getUserMetadata } from '@/lib/roles'
import { updateStorefront } from '@/lib/storefront'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

async function getClinicStorefront(clientId: string) {
  if (!prisma) return null
  return prisma.storefront.findUnique({
    where: { clientId },
    include: {
      client: { select: { organizationName: true } },
      _count: { select: { products: true, retailOrders: true, endCustomers: true } },
    },
  })
}

export async function GET() {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const meta = await getUserMetadata()
    if (!meta.clientId) return errorResponse('No client association found', 403, 'NO_CLIENT')

    const storefront = await getClinicStorefront(meta.clientId)
    if (!storefront) return errorResponse('No storefront found for this clinic', 404, 'NOT_FOUND')

    return successResponse(storefront)
  } catch (error) {
    logger.error('Error fetching clinic storefront', {}, error as Error)
    return errorResponse('Failed to fetch storefront')
  }
}

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  brandingConfig: z.any().optional(),
})

export async function PATCH(request: NextRequest) {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const meta = await getUserMetadata()
    if (!meta.clientId) return errorResponse('No client association found', 403, 'NO_CLIENT')

    const storefront = await getClinicStorefront(meta.clientId)
    if (!storefront) return errorResponse('No storefront found for this clinic', 404, 'NOT_FOUND')

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }

    const updated = await updateStorefront(storefront.id, parsed.data)
    return successResponse(updated)
  } catch (error) {
    logger.error('Error updating clinic storefront', {}, error as Error)
    return errorResponse('Failed to update storefront')
  }
}
