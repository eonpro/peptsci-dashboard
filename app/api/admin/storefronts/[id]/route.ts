import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { getStorefrontById, updateStorefront, deleteStorefront } from '@/lib/storefront'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

async function getRole(): Promise<string> {
  if (!isClerkConfigured) return 'ADMIN'
  const { getUserMetadata } = await import('@/lib/roles')
  const metadata = await getUserMetadata()
  return metadata.role
}

export const dynamic = 'force-dynamic'

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase alphanumeric with optional hyphens')
    .optional(),
  brandingConfig: z.any().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED']).optional(),
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const role = await getRole()
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return forbiddenResponse()

    const { id } = await params
    const storefront = await getStorefrontById(id)
    if (!storefront) return errorResponse('Storefront not found', 404, 'NOT_FOUND')

    return successResponse(storefront)
  } catch (error) {
    logger.error('Error fetching storefront', {}, error as Error)
    return errorResponse('Failed to fetch storefront')
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, userId } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const role = await getRole()
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return forbiddenResponse()

    const { id } = await params
    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }

    const storefront = await updateStorefront(id, parsed.data)
    logger.info('Storefront updated', { storefrontId: id, updatedBy: userId, changes: Object.keys(parsed.data) })
    return successResponse(storefront)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to update storefront'
    logger.error('Error updating storefront', {}, error as Error)
    return errorResponse(msg, msg.includes('already taken') ? 409 : 500)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuthenticated, userId } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const role = await getRole()
    if (role !== 'SUPER_ADMIN') return forbiddenResponse('Only super admins can delete storefronts')

    const { id } = await params
    await deleteStorefront(id)
    logger.info('Storefront deleted', { storefrontId: id, deletedBy: userId })
    return successResponse({ message: 'Storefront deleted' })
  } catch (error) {
    logger.error('Error deleting storefront', {}, error as Error)
    return errorResponse('Failed to delete storefront')
  }
}
