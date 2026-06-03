import { NextRequest } from 'next/server'
import { requireAuth, unauthorizedResponse, forbiddenResponse, errorResponse, successResponse } from '@/lib/auth'
import { listStorefronts, createStorefront } from '@/lib/storefront'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const isClerkConfigured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_')

async function getRole() {
  if (!isClerkConfigured) return 'ADMIN'
  const { getUserMetadata } = await import('@/lib/roles')
  const meta = await getUserMetadata()
  return meta.role
}

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  clientId: z.string().min(1),
  slug: z
    .string()
    .min(3)
    .max(48)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase alphanumeric with optional hyphens'),
  name: z.string().min(1).max(120),
  brandingConfig: z.any().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { isAuthenticated } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const role = await getRole()
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return forbiddenResponse()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? undefined
    const clientId = searchParams.get('clientId') ?? undefined

    const storefronts = await listStorefronts({ status, clientId })
    return successResponse(storefronts)
  } catch (error) {
    logger.error('Error listing storefronts', {}, error as Error)
    return errorResponse('Failed to list storefronts')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { isAuthenticated, userId } = await requireAuth()
    if (!isAuthenticated) return unauthorizedResponse()

    const role = await getRole()
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return forbiddenResponse()

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse(parsed.error.errors.map((e) => e.message).join(', '), 400, 'VALIDATION_ERROR')
    }

    const storefront = await createStorefront(parsed.data)
    logger.info('Storefront created', { storefrontId: storefront.id, slug: parsed.data.slug, createdBy: userId })
    return successResponse(storefront, 201)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create storefront'
    logger.error('Error creating storefront', {}, error as Error)
    return errorResponse(msg, msg.includes('already taken') ? 409 : 500)
  }
}
